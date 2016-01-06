const environment = {
  development: {
    isProduction: false
  },
  production: {
    isProduction: true
  }
}[process.env.NODE_ENV || 'development'];

export default Object.assign({
  host: process.env.APIHOST || 'localhost',
  port: process.env.APIPORT,
  database: {
    client: 'mysql',
    connection: {
      host: '127.0.0.1',
      user: 'root',
      password: 'T3mp0r4l.',
      database: 'blog'
    }
  }
}, environment);
