import React, { useState, useCallback } from 'react';
import { Upload, FileText, Clock, Database, TrendingUp, AlertTriangle, BarChart3, PieChart, Activity } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart as RechartsPieChart, Cell, LineChart, Line, ScatterChart, Scatter } from 'recharts';

const SlowQueryDashboard = () => {
  const [logData, setLogData] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedTab, setSelectedTab] = useState('performance');
  const [expandedRows, setExpandedRows] = useState(new Set());

  // Colors for charts
  const COLORS = ['#3B82F6', '#EF4444', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16'];

  const normalizeQuery = (query) => {
    if (!query) return '';
    
    return query
      // Remove extra whitespace and normalize
      .replace(/\s+/g, ' ')
      .trim()
      // Replace string literals
      .replace(/'[^']*'/g, '?')
      .replace(/"[^"]*"/g, '?')
      // Replace numbers
      .replace(/\b\d+\.?\d*\b/g, '?')
      // Replace IN clauses with multiple values
      .replace(/\(\s*\?\s*(?:,\s*\?\s*)+\)/g, '(?)')
      // Replace timestamp patterns
      .replace(/\?\-\?\-\?\s+\?\:\?\:\?(\.\?)?/g, '?')
      // Normalize common patterns
      .replace(/\bLIMIT\s+\?\s*,?\s*\?/gi, 'LIMIT ?')
      .replace(/\bOFFSET\s+\?/gi, 'OFFSET ?')
      // Convert to lowercase for consistency
      .toLowerCase();
  };

  const parseSlowQueryLog = (content) => {
    const entries = [];
    const lines = content.split('\n');
    let currentEntry = {};
    let inExplain = false;
    let queryLines = [];
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      if (line.startsWith('# Time:')) {
        // Save previous entry if exists
        if (currentEntry.timestamp && queryLines.length > 0) {
          let rawQuery = queryLines.join(' ');
          // Remove SET timestamp at the beginning
          rawQuery = rawQuery.replace(/^SET timestamp=\d+;\s*/i, '');
          // Split on semicolon and take the first part (the actual query)
          const queryParts = rawQuery.split(';');
          currentEntry.query = queryParts[0].trim();
          currentEntry.normalizedQuery = normalizeQuery(currentEntry.query);
          entries.push(currentEntry);
        }
        
        // Start new entry
        currentEntry = {
          timestamp: line.replace('# Time: ', ''),
          queryLines: []
        };
        queryLines = [];
        inExplain = false;
      } else if (line.startsWith('# User@Host:')) {
        const match = line.match(/# User@Host: ([^@]+)@([^@]+) @ ([^\[]+) \[([^\]]+)\]/);
        if (match) {
          currentEntry.user = match[1];
          currentEntry.host = match[3];
          currentEntry.ip = match[4];
        }
      } else if (line.startsWith('# Thread_id:')) {
        const match = line.match(/Thread_id: (\d+)\s+Schema: (\w+)/);
        if (match) {
          currentEntry.threadId = match[1];
          currentEntry.schema = match[2];
        }
      } else if (line.startsWith('# Query_time:')) {
        const match = line.match(/Query_time: ([\d.]+)\s+Lock_time: ([\d.]+)\s+Rows_sent: (\d+)\s+Rows_examined: (\d+)/);
        if (match) {
          currentEntry.queryTime = parseFloat(match[1]);
          currentEntry.lockTime = parseFloat(match[2]);
          currentEntry.rowsSent = parseInt(match[3]);
          currentEntry.rowsExamined = parseInt(match[4]);
        }
      } else if (line.startsWith('# Rows_affected:')) {
        const match = line.match(/Rows_affected: (\d+)\s+Bytes_sent: (\d+)/);
        if (match) {
          currentEntry.rowsAffected = parseInt(match[1]);
          currentEntry.bytesSent = parseInt(match[2]);
        }
      } else if (line.startsWith('# Tmp_tables:')) {
        const match = line.match(/Tmp_tables: (\d+)\s+Tmp_disk_tables: (\d+)/);
        if (match) {
          currentEntry.tmpTables = parseInt(match[1]);
          currentEntry.tmpDiskTables = parseInt(match[2]);
        }
      } else if (line.startsWith('# Full_scan:')) {
        currentEntry.fullScan = line.includes('Full_scan: Yes');
        currentEntry.fullJoin = line.includes('Full_join: Yes');
        currentEntry.tmpTable = line.includes('Tmp_table: Yes');
        currentEntry.filesort = line.includes('Filesort: Yes');
      } else if (line.startsWith('# explain:')) {
        inExplain = true;
      } else if (line === '#' && inExplain) {
        // End of explain section
        inExplain = false;
      } else if (!line.startsWith('#') && line.length > 0) {
        // Stop being in explain mode when we hit a non-comment line
        if (inExplain) {
          inExplain = false;
        }
        queryLines.push(line);
      }
    }
    
    // Don't forget the last entry
    if (currentEntry.timestamp && queryLines.length > 0) {
      let rawQuery = queryLines.join(' ');
      // Remove SET timestamp at the beginning
      rawQuery = rawQuery.replace(/^SET timestamp=\d+;\s*/i, '');
      // Split on semicolon and take the first part (the actual query)
      const queryParts = rawQuery.split(';');
      currentEntry.query = queryParts[0].trim();
      currentEntry.normalizedQuery = normalizeQuery(currentEntry.query);
      entries.push(currentEntry);
    }
    
    return entries;
  };

  const analyzeQueries = (entries) => {
    // Group by normalized query
    const queryGroups = {};
    entries.forEach(entry => {
      const normalized = entry.normalizedQuery || 'unknown';
      if (!queryGroups[normalized]) {
        queryGroups[normalized] = {
          count: 0,
          totalTime: 0,
          maxTime: 0,
          minTime: Infinity,
          totalRowsExamined: 0,
          maxRowsExamined: 0,
          queries: [],
          type: getQueryType(normalized)
        };
      }
      
      queryGroups[normalized].count++;
      queryGroups[normalized].totalTime += entry.queryTime || 0;
      queryGroups[normalized].maxTime = Math.max(queryGroups[normalized].maxTime, entry.queryTime || 0);
      queryGroups[normalized].minTime = Math.min(queryGroups[normalized].minTime, entry.queryTime || 0);
      queryGroups[normalized].totalRowsExamined += entry.rowsExamined || 0;
      queryGroups[normalized].maxRowsExamined = Math.max(queryGroups[normalized].maxRowsExamined, entry.rowsExamined || 0);
      queryGroups[normalized].queries.push(entry);
    });

    // Calculate averages
    Object.values(queryGroups).forEach(group => {
      group.avgTime = group.totalTime / group.count;
      group.avgRowsExamined = group.totalRowsExamined / group.count;
    });

    return queryGroups;
  };

  const getQueryType = (query) => {
    if (!query) return 'unknown';
    const q = query.toLowerCase().trim();
    if (q.startsWith('select')) return 'SELECT';
    if (q.startsWith('insert')) return 'INSERT';
    if (q.startsWith('update')) return 'UPDATE';
    if (q.startsWith('delete')) return 'DELETE';
    if (q.startsWith('call')) return 'STORED_PROC';
    if (q.startsWith('create')) return 'CREATE';
    if (q.startsWith('alter')) return 'ALTER';
    if (q.startsWith('drop')) return 'DROP';
    return 'OTHER';
  };

  const handleFileUpload = useCallback(async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setIsLoading(true);
    try {
      const content = await file.text();
      const entries = parseSlowQueryLog(content);
      const analysis = analyzeQueries(entries);
      
      setLogData({
        entries,
        analysis,
        summary: {
          totalQueries: entries.length,
          uniqueQueries: Object.keys(analysis).length,
          totalTime: entries.reduce((sum, e) => sum + (e.queryTime || 0), 0),
          avgTime: entries.reduce((sum, e) => sum + (e.queryTime || 0), 0) / entries.length,
          maxTime: Math.max(...entries.map(e => e.queryTime || 0)),
          totalRowsExamined: entries.reduce((sum, e) => sum + (e.rowsExamined || 0), 0)
        }
      });
    } catch (error) {
      console.error('Error parsing log file:', error);
      alert('Error parsing log file. Please check the format.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const formatTime = (seconds) => {
    if (seconds < 60) return `${seconds.toFixed(2)}s`;
    if (seconds < 3600) return `${(seconds / 60).toFixed(1)}m`;
    return `${(seconds / 3600).toFixed(1)}h`;
  };

  const formatNumber = (num) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  };

  const toggleRowExpansion = (index) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(index)) {
      newExpanded.delete(index);
    } else {
      newExpanded.add(index);
    }
    setExpandedRows(newExpanded);
  };

  // Prepare chart data
  const getTopQueriesByTime = () => {
    if (!logData) return [];
    return Object.entries(logData.analysis)
      .sort(([,a], [,b]) => b.totalTime - a.totalTime)
      .slice(0, 10)
      .map(([query, data]) => ({
        query: query.substring(0, 50) + '...',
        fullQuery: query,
        totalTime: data.totalTime,
        avgTime: data.avgTime,
        minTime: data.minTime === Infinity ? 0 : data.minTime,
        maxTime: data.maxTime,
        count: data.count,
        type: data.type
      }));
  };

  const getTimelineData = () => {
    if (!logData) return [];
    
    // Group queries by hour
    const timeline = {};
    logData.entries.forEach(entry => {
      if (!entry.timestamp || !entry.queryTime) return;
      
      // Parse timestamp format: YYMMDD HH:MM:SS
      const timestampMatch = entry.timestamp.match(/(\d{6})\s+(\d{1,2}):(\d{2}):(\d{2})/);
      if (!timestampMatch) return;
      
      const [, date, hour] = timestampMatch;
      const key = `${date} ${hour.padStart(2, '0')}:00`;
      
      if (!timeline[key]) {
        timeline[key] = {
          time: key,
          totalQueries: 0,
          slowQueries: 0,
          totalTime: 0,
          avgTime: 0,
          maxTime: 0,
          types: {}
        };
      }
      
      timeline[key].totalQueries++;
      timeline[key].totalTime += entry.queryTime;
      timeline[key].maxTime = Math.max(timeline[key].maxTime, entry.queryTime);
      
      if (entry.queryTime > 10) { // Consider >10s as slow
        timeline[key].slowQueries++;
      }
      
      const queryType = getQueryType(entry.normalizedQuery || entry.query);
      timeline[key].types[queryType] = (timeline[key].types[queryType] || 0) + 1;
    });
    
    // Calculate averages and sort by time
    return Object.values(timeline)
      .map(item => ({
        ...item,
        avgTime: item.totalTime / item.totalQueries
      }))
      .sort((a, b) => a.time.localeCompare(b.time));
  };

  const getQueryTypeDistribution = () => {
    if (!logData) return [];
    const types = {};
    Object.values(logData.analysis).forEach(group => {
      types[group.type] = (types[group.type] || 0) + group.count;
    });
    return Object.entries(types).map(([type, count]) => ({ type, count }));
  };

  const getPerformanceMetrics = () => {
    if (!logData) return [];
    return Object.entries(logData.analysis)
      .sort(([,a], [,b]) => b.avgTime - a.avgTime)
      .slice(0, 20)
      .map(([query, data]) => ({
        query: query.substring(0, 40) + '...',
        fullQuery: query,
        avgTime: data.avgTime,
        maxTime: data.maxTime,
        minTime: data.minTime === Infinity ? 0 : data.minTime,
        count: data.count,
        avgRows: data.avgRowsExamined,
        maxRows: data.maxRowsExamined,
        type: data.type,
        executions: data.queries
      }));
  };

  const formatTimestamp = (timestamp) => {
    if (!timestamp) return 'Unknown';
    // Parse format: YYMMDD HH:MM:SS
    const match = timestamp.match(/(\d{2})(\d{2})(\d{2})\s+(\d{1,2}):(\d{2}):(\d{2})/);
    if (!match) return timestamp;
    
    const [, year, month, day, hour, minute, second] = match;
    const fullYear = 2000 + parseInt(year);
    return `${fullYear}-${month}-${day} ${hour.padStart(2, '0')}:${minute}:${second}`;
  };

  const getPerformanceIssues = (executions) => {
    const issues = {
      critical: 0,
      warning: 0,
      info: 0,
      hasSuggestions: false
    };

    executions.forEach(e => {
      if (e.tmpDiskTables > 0) issues.critical++;
      if (e.fullScan) issues.critical++;
      if (e.fullJoin) issues.critical++;
      if (e.filesort) issues.warning++;
      if (e.tmpTables > 0) issues.info++;
    });

    // Check for high examine-to-result ratio
    const hasHighRatio = executions.some(e => (e.rowsExamined || 0) / (e.rowsSent || 1) > 1000);
    if (hasHighRatio) issues.warning++;

    issues.hasSuggestions = issues.critical > 0 || issues.warning > 0 || issues.info > 0;

    return issues;
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Database className="w-8 h-8 text-blue-600" />
            <h1 className="text-2xl font-bold text-gray-900">MySQL Slow Query Analyzer</h1>
          </div>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg cursor-pointer hover:bg-blue-700 transition-colors">
              <Upload className="w-4 h-4" />
              Upload Log File
              <input
                type="file"
                className="hidden"
                accept=".log,.txt"
                onChange={handleFileUpload}
                disabled={isLoading}
              />
            </label>
          </div>
        </div>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <span className="ml-3 text-gray-600">Analyzing log file...</span>
        </div>
      )}

      {!logData && !isLoading && (
        <div className="flex flex-col items-center justify-center py-16">
          <FileText className="w-16 h-16 text-gray-400 mb-4" />
          <h2 className="text-xl font-semibold text-gray-700 mb-2">No log file uploaded</h2>
          <p className="text-gray-500 text-center mb-6">
            Upload a MySQL slow query log file to start analyzing query performance
          </p>
        </div>
      )}

      {logData && (
        <>
          {/* Summary Cards */}
          <div className="px-6 py-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
              <div className="bg-white rounded-lg border border-gray-200 p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Total Queries</p>
                    <p className="text-2xl font-bold text-gray-900">{formatNumber(logData.summary.totalQueries)}</p>
                  </div>
                  <BarChart3 className="w-8 h-8 text-blue-600" />
                </div>
              </div>
              
              <div className="bg-white rounded-lg border border-gray-200 p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Unique Patterns</p>
                    <p className="text-2xl font-bold text-gray-900">{logData.summary.uniqueQueries}</p>
                  </div>
                  <PieChart className="w-8 h-8 text-green-600" />
                </div>
              </div>
              
              <div className="bg-white rounded-lg border border-gray-200 p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Total Time</p>
                    <p className="text-2xl font-bold text-gray-900">{formatTime(logData.summary.totalTime)}</p>
                  </div>
                  <Clock className="w-8 h-8 text-orange-600" />
                </div>
              </div>
              
              <div className="bg-white rounded-lg border border-gray-200 p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Slowest Query</p>
                    <p className="text-2xl font-bold text-gray-900">{formatTime(logData.summary.maxTime)}</p>
                  </div>
                  <AlertTriangle className="w-8 h-8 text-red-600" />
                </div>
              </div>
            </div>

            {/* Navigation Tabs */}
            <div className="flex space-x-1 bg-gray-100 rounded-lg p-1 mb-6">
              {[
                { id: 'timeline', label: 'Timeline', icon: Clock },
                { id: 'performance', label: 'Performance', icon: TrendingUp }
              ].map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => setSelectedTab(id)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                    selectedTab === id
                      ? 'bg-white text-blue-600 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {label}
                </button>
              ))}
            </div>

            {/* Tab Content */}

            {selectedTab === 'timeline' && (
              <div className="space-y-6">
                <div className="bg-white rounded-lg border border-gray-200 p-6">
                  <h3 className="text-lg font-semibold mb-4">Query Volume Over Time</h3>
                  <ResponsiveContainer width="100%" height={400}>
                    <LineChart data={getTimelineData()}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis 
                        dataKey="time" 
                        angle={-45}
                        textAnchor="end"
                        height={80}
                      />
                      <YAxis />
                      <Tooltip 
                        formatter={(value, name) => {
                          if (name === 'avgTime' || name === 'maxTime') return [formatTime(value), name];
                          return [value, name];
                        }}
                      />
                      <Line type="monotone" dataKey="totalQueries" stroke="#3B82F6" name="Total Queries" strokeWidth={2} />
                      <Line type="monotone" dataKey="slowQueries" stroke="#EF4444" name="Slow Queries (>10s)" strokeWidth={2} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="bg-white rounded-lg border border-gray-200 p-6">
                    <h3 className="text-lg font-semibold mb-4">Average Query Time by Hour</h3>
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={getTimelineData()}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis 
                          dataKey="time" 
                          angle={-45}
                          textAnchor="end"
                          height={80}
                        />
                        <YAxis />
                        <Tooltip formatter={(value) => [formatTime(value), 'Avg Time']} />
                        <Bar dataKey="avgTime" fill="#10B981" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  <div className="bg-white rounded-lg border border-gray-200 p-6">
                    <h3 className="text-lg font-semibold mb-4">Peak Query Times by Hour</h3>
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={getTimelineData()}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis 
                          dataKey="time" 
                          angle={-45}
                          textAnchor="end"
                          height={80}
                        />
                        <YAxis />
                        <Tooltip formatter={(value) => [formatTime(value), 'Max Time']} />
                        <Bar dataKey="maxTime" fill="#EF4444" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            )}

            {selectedTab === 'performance' && (
              <div className="space-y-6">
                <div className="bg-white rounded-lg border border-gray-200">
                  <div className="p-6">
                    <h3 className="text-lg font-semibold mb-4">Performance Ranking</h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-6 py-3 text-left font-medium text-gray-900">Rank</th>
                          <th className="px-6 py-3 text-left font-medium text-gray-900">Query Pattern</th>
                          <th className="px-6 py-3 text-left font-medium text-gray-900">Avg Time</th>
                          <th className="px-6 py-3 text-left font-medium text-gray-900">Max Time</th>
                          <th className="px-6 py-3 text-left font-medium text-gray-900">Avg Rows</th>
                          <th className="px-6 py-3 text-left font-medium text-gray-900">Max Rows</th>
                          <th className="px-6 py-3 text-left font-medium text-gray-900">Executions</th>
                          <th className="px-6 py-3 text-center font-medium text-gray-900">Suggestions</th>
                          <th className="px-6 py-3 text-left font-medium text-gray-900">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {getPerformanceMetrics().slice(0, 15).map((query, index) => (
                          <React.Fragment key={index}>
                            <tr className="hover:bg-gray-50">
                              <td className="px-6 py-4 text-gray-900 font-medium">#{index + 1}</td>
                              <td className="px-6 py-4">
                                <div className="max-w-xs truncate text-gray-900 font-mono text-xs">
                                  {query.query}
                                </div>
                              </td>
                              <td className="px-6 py-4">
                                <span className={`font-medium ${query.avgTime > 60 ? 'text-red-600' : query.avgTime > 10 ? 'text-orange-600' : query.avgTime > 1 ? 'text-green-600' : 'text-gray-900'}`}>
                                  {formatTime(query.avgTime)}
                                </span>
                              </td>
                              <td className="px-6 py-4">
                                <span className={`font-medium ${query.maxTime > 60 ? 'text-red-600' : query.maxTime > 10 ? 'text-orange-600' : 'text-gray-900'}`}>
                                  {formatTime(query.maxTime)}
                                </span>
                              </td>
                              <td className="px-6 py-4 text-gray-900">{formatNumber(query.avgRows)}</td>
                              <td className="px-6 py-4 text-gray-900">{formatNumber(query.maxRows)}</td>
                              <td className="px-6 py-4 text-gray-900">{formatNumber(query.count)}</td>
                              <td className="px-6 py-4 text-center">
                                {(() => {
                                  const issues = getPerformanceIssues(query.executions);
                                  if (!issues.hasSuggestions) {
                                    return <span className="text-gray-300">-</span>;
                                  }
                                  return (
                                    <div className="flex items-center justify-center">
                                      {issues.critical > 0 && (
                                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800 mr-1" title={`${issues.critical} critical issue(s)`}>
                                          🚨 {issues.critical}
                                        </span>
                                      )}
                                      {issues.warning > 0 && (
                                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-800 mr-1" title={`${issues.warning} warning(s)`}>
                                          ⚠️ {issues.warning}
                                        </span>
                                      )}
                                      {issues.info > 0 && !issues.critical && !issues.warning && (
                                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800" title={`${issues.info} optimization opportunity(ies)`}>
                                          💡 {issues.info}
                                        </span>
                                      )}
                                    </div>
                                  );
                                })()}
                              </td>
                              <td className="px-6 py-4">
                                <button
                                  onClick={() => toggleRowExpansion(`performance-${index}`)}
                                  className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                                >
                                  {expandedRows.has(`performance-${index}`) ? 'Hide' : 'Show'} Queries
                                </button>
                              </td>
                            </tr>
                            {expandedRows.has(`performance-${index}`) && (
                              <tr>
                                <td colSpan="9" className="px-6 py-4 bg-gray-50">
                                  <div className="space-y-4">
                                    <div>
                                      <h4 className="font-medium text-gray-900 mb-2">Full Query Pattern:</h4>
                                      <div className="bg-white p-4 rounded border font-mono text-sm text-gray-800 whitespace-pre-wrap max-h-32 overflow-y-auto">
                                        {query.fullQuery}
                                      </div>
                                    </div>
                                    
                                    <div>
                                      <h4 className="font-medium text-gray-900 mb-3">Individual Executions ({query.executions.length} total):</h4>
                                      <div className="bg-white rounded border overflow-hidden">
                                        <div className="max-h-64 overflow-y-auto">
                                          <table className="w-full text-xs">
                                            <thead className="bg-gray-100 sticky top-0">
                                              <tr>
                                                <th className="px-3 py-2 text-left font-medium text-gray-700">Timestamp</th>
                                                <th className="px-3 py-2 text-left font-medium text-gray-700">Exec Time</th>
                                                <th className="px-3 py-2 text-left font-medium text-gray-700">Rows Exam</th>
                                                <th className="px-3 py-2 text-left font-medium text-gray-700">Tmp Tables</th>
                                                <th className="px-3 py-2 text-left font-medium text-gray-700">Filesort</th>
                                                <th className="px-3 py-2 text-left font-medium text-gray-700">Performance Flags</th>
                                                <th className="px-3 py-2 text-left font-medium text-gray-700">More</th>
                                              </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-200">
                                              {query.executions
                                                .sort((a, b) => (b.queryTime || 0) - (a.queryTime || 0))
                                                .map((execution, execIndex) => (
                                                <tr key={execIndex} className={`hover:bg-gray-50 ${execution.queryTime > 60 ? 'bg-red-50' : execution.queryTime > 10 ? 'bg-orange-50' : ''}`}>
                                                  <td className="px-3 py-2 text-gray-900 text-xs">{formatTimestamp(execution.timestamp)}</td>
                                                  <td className="px-3 py-2">
                                                    <span className={`font-medium text-xs ${execution.queryTime > 60 ? 'text-red-600' : execution.queryTime > 10 ? 'text-orange-600' : 'text-gray-900'}`}>
                                                      {formatTime(execution.queryTime || 0)}
                                                    </span>
                                                  </td>
                                                  <td className="px-3 py-2 text-gray-900 text-xs">{formatNumber(execution.rowsExamined || 0)}</td>
                                                  <td className="px-3 py-2 text-xs">
                                                    {(execution.tmpTables || 0) > 0 ? (
                                                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                                                        execution.tmpDiskTables > 0 ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'
                                                      }`}>
                                                        {execution.tmpTables}{execution.tmpDiskTables > 0 ? ` (${execution.tmpDiskTables} disk)` : ''}
                                                      </span>
                                                    ) : (
                                                      <span className="text-gray-400">-</span>
                                                    )}
                                                  </td>
                                                  <td className="px-3 py-2 text-xs">
                                                    {execution.filesort ? (
                                                      <span className="px-2 py-1 rounded text-xs font-medium bg-orange-100 text-orange-800">
                                                        Yes
                                                      </span>
                                                    ) : (
                                                      <span className="text-gray-400">-</span>
                                                    )}
                                                  </td>
                                                  <td className="px-3 py-2 text-xs">
                                                    <div className="flex flex-wrap gap-1">
                                                      {execution.fullScan && (
                                                        <span className="px-1 py-0.5 bg-red-100 text-red-700 rounded text-xs font-medium">SCAN</span>
                                                      )}
                                                      {execution.fullJoin && (
                                                        <span className="px-1 py-0.5 bg-red-100 text-red-700 rounded text-xs font-medium">JOIN</span>
                                                      )}
                                                      {execution.tmpTable && (
                                                        <span className="px-1 py-0.5 bg-yellow-100 text-yellow-700 rounded text-xs font-medium">TMP</span>
                                                      )}
                                                    </div>
                                                  </td>
                                                  <td className="px-3 py-2 text-xs text-gray-500">
                                                    <div className="space-y-0.5">
                                                      <div>Lock: {formatTime(execution.lockTime || 0)}</div>
                                                      <div>Sent: {formatNumber(execution.rowsSent || 0)}</div>
                                                      <div>Bytes: {formatNumber(execution.bytesSent || 0)}</div>
                                                    </div>
                                                  </td>
                                                </tr>
                                              ))}
                                            </tbody>
                                          </table>
                                        </div>
                                      </div>
                                    </div>
                                    
                                    <div>
                                      <h4 className="font-medium text-gray-900 mb-2">Performance Insights:</h4>
                                      <div className="bg-white rounded border p-3">
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                                          {/* Performance Issues */}
                                          <div>
                                            <h5 className="font-medium text-red-700 mb-2">⚠️ Issues Found:</h5>
                                            <div className="space-y-1">
                                              {query.executions.some(e => e.tmpDiskTables > 0) && (
                                                <div className="text-red-600">• Temp tables created on disk (memory exhausted)</div>
                                              )}
                                              {query.executions.some(e => e.fullScan) && (
                                                <div className="text-red-600">• Full table scans detected</div>
                                              )}
                                              {query.executions.some(e => e.fullJoin) && (
                                                <div className="text-red-600">• Full joins without indexes</div>
                                              )}
                                              {query.executions.some(e => e.filesort) && (
                                                <div className="text-orange-600">• Filesort operations (ORDER BY/GROUP BY without index)</div>
                                              )}
                                              {query.executions.some(e => e.tmpTables > 0) && (
                                                <div className="text-yellow-600">• Temporary tables created</div>
                                              )}
                                              {query.executions.every(e => 
                                                !e.tmpDiskTables && !e.fullScan && !e.fullJoin && !e.filesort && !e.tmpTables
                                              ) && (
                                                <div className="text-green-600">✓ No major performance issues detected</div>
                                              )}
                                            </div>
                                          </div>
                                          
                                          {/* Optimization Suggestions */}
                                          <div>
                                            <h5 className="font-medium text-blue-700 mb-2">💡 Optimization Suggestions:</h5>
                                            <div className="space-y-1">
                                              {query.executions.some(e => e.fullScan || e.fullJoin) && (
                                                <div className="text-gray-700">• Add indexes on JOIN/WHERE columns</div>
                                              )}
                                              {query.executions.some(e => e.filesort) && (
                                                <div className="text-gray-700">• Create composite index for ORDER BY/GROUP BY</div>
                                              )}
                                              {query.executions.some(e => e.tmpDiskTables > 0) && (
                                                <div className="text-gray-700">• Increase tmp_table_size and max_heap_table_size</div>
                                              )}
                                              {query.avgRows > 1000000 && (
                                                <div className="text-gray-700">• Consider query optimization (examining {formatNumber(query.avgRows)} rows avg)</div>
                                              )}
                                              {query.executions.some(e => (e.rowsExamined || 0) / (e.rowsSent || 1) > 1000) && (
                                                <div className="text-gray-700">• High examine-to-result ratio - review WHERE conditions</div>
                                              )}
                                            </div>
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default SlowQueryDashboard;