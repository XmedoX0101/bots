module.exports = {
  apps: [
    {
      name: 'Bot1-Clinic',
      script: 'index.js',
      cwd: '/home/container/bot1',
      env_file: '/home/container/bot1/.env',
      max_memory_restart: '150M',
      watch: false,
      autorestart: true,
      max_restarts: 10
    },
    {
      name: 'Bot2-Other',
      script: 'index.js',
      cwd: '/home/container/bot2',
      env_file: '/home/container/bot2/.env',
      max_memory_restart: '150M',
      watch: false,
      autorestart: true,
      max_restarts: 10
    }
  ]
};