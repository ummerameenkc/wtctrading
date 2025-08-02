const mysql = require( 'mysql' );
const transaction = require('node-mysql-transaction');


class Transaction {

    static con = this.con

    constructor() {
        let config = {
            host: "localhost",
            user: "root",
            password: "",
            database: "account_resolver"
          }

    // Sql connection with Transaction
    this.con = transaction({
        connection: [mysql.createConnection,config],
        // create temporary connection for increased volume of async work.
        // if request queue became empty, 
        // start soft removing process of the connection.
        // recommended for normal usage.
        dynamicConnection: 32,
        
        // set dynamicConnection soft removing time.
        idleConnectionCutoffTime: 1000,
        
        // auto timeout rollback time in ms
        // turn off is 0
        timeout:600
      });


    


    }


  

}

module.exports = {
  Transaction
}