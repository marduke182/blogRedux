import express from 'express';
import bodyParser from 'body-parser';
import PrettyError from 'pretty-error';
import config from './config';
// initializing the models
import models from './models'; // eslint-disable-line
import http from 'http';
import SocketIo from 'socket.io';
import routes from './routes';
import _ from 'lodash'; // eslint-disable-line
const pretty = new PrettyError();
const app = express();

const server = new http.Server(app);

const io = new SocketIo(server);
io.path('/ws');

app.use(bodyParser.json());
_.each(routes, (value) => {
  app.use(value.path, value.routes);
});

if (config.port) {
  const runnable = app.listen(config.port, (err) => {
    if (err) {
      console.error(err);
    }
    console.info('----\n==> 🌎  API is running on port %s', config.port);
    console.info('==> 💻  Send requests to http://%s:%s', config.host, config.port);
  });

  io.on('connection', (socket) => { // eslint-disable-line
    // initialize socket
  });
  io.listen(runnable);

} else {
  console.error('==>     ERROR: No PORT environment variable has been specified');
}
