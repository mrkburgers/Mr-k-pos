const http = require("http");

const PORT = 3000;

const server = http.createServer((req, res) => {

  res.writeHead(200, { "Content-Type": "application/json" });

  res.end(

    JSON.stringify({

      app: "Mr K POS",

      version: "2.0.0",

      status: "server online"

    })

  );

});

server.listen(PORT, () => {

  console.log(`Mr K POS v2 server running on port ${PORT}`);

});
