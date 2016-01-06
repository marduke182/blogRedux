import sqlite3 from './sqlite3';
import mysql from './mysql';
import pg from './pg';

export default {
  sqlite3,
  mysql,
  pg,
  postgres: pg,
  postgresql: pg
};
