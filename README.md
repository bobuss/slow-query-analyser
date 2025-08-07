# MySQL Slow Query Analyzer

A React-based dashboard for analyzing and visualizing MySQL/MariaDB slow query logs. Upload your slow query log files and get detailed performance insights with interactive charts and statistics.

![MySQL Slow Query Analyzer](https://img.shields.io/badge/MySQL-Slow%20Query%20Analyzer-blue)
![React](https://img.shields.io/badge/React-18.2.0-blue)
![Vite](https://img.shields.io/badge/Vite-4.4.5-purple)

## Features

- **File Upload Processing**: Drag and drop slow query log files directly in your browser
- **Query Pattern Recognition**: Automatically groups similar queries by normalizing SQL syntax
- **Performance Metrics**: Tracks query execution time, rows examined, lock time, and other MySQL metrics
- **Interactive Dashboard**: Multi-tab interface with comprehensive analysis views:
  - **Performance Tab**: Overview with distribution charts and performance alerts
  - **Top Queries Tab**: Time-based ranking of slowest queries
  - **Query Types Tab**: SQL operation breakdown (SELECT, INSERT, UPDATE, DELETE)
  - **Analysis Tab**: Scatter plot analysis for advanced performance insights

## Quick Start

### Option 1: Use the Hosted Version
Visit the live application at: **https://yourusername.github.io/slow-query-analyser/**

### Option 2: Run Locally

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd slow-query-analyser
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Start the development server**
   ```bash
   npm run dev
   ```

4. **Open your browser** to http://localhost:3000

5. **Upload a slow query log file** and start analyzing!

## Usage

1. **Prepare your slow query log**: Enable MySQL/MariaDB slow query logging:
   ```sql
   SET GLOBAL slow_query_log = 'ON';
   SET GLOBAL long_query_time = 1;
   SET GLOBAL slow_query_log_file = '/path/to/slow-query.log';
   ```

2. **Upload the log file**: Use the file upload interface in the application

3. **Analyze results**: Navigate through the different tabs to explore:
   - Query patterns and frequency
   - Performance bottlenecks
   - Resource usage statistics
   - Query execution trends

## Supported Log Format

The application parses standard MySQL/MariaDB slow query log format including:
- Query execution time and lock time
- Rows sent and examined
- Temporary tables and full table scans
- User and host information
- Complete SQL query text

## Development

### Available Scripts

- `npm run dev` - Start development server (port 3000)
- `npm run build` - Build for production
- `npm run preview` - Preview production build

### Architecture

Built with modern web technologies:
- **React 18** with hooks for state management
- **Vite** for fast development and building
- **Recharts** for interactive data visualizations
- **Lucide React** for clean UI icons
- **Tailwind CSS** for responsive styling

### Key Components

- `SlowQueryDashboard` - Main application component
- `parseSlowQueryLog` - Log file parser
- `normalizeQuery` - SQL query pattern normalizer
- Multiple chart components for data visualization

## Browser Compatibility

- Modern browsers with ES6+ support
- File API support required for log file uploads
- No server-side processing needed - runs entirely in the browser

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Deployment

The application is automatically deployed to GitHub Pages on every push to the main branch via GitHub Actions. 

### Manual Deployment Steps

If you want to deploy to your own GitHub Pages:

1. **Enable GitHub Pages** in your repository settings:
   - Go to Settings → Pages
   - Source: Deploy from a branch → GitHub Actions

2. **Push to main branch** - the workflow will automatically build and deploy

3. **Access your app** at `https://yourusername.github.io/repository-name/`

The deployment workflow:
- Builds the React app using Vite
- Generates static files in the `dist` folder
- Deploys to GitHub Pages automatically

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

---

**Note**: This tool processes slow query logs locally in your browser. No data is sent to external servers, ensuring your database performance data remains private and secure.