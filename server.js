const express = require("express");

const app = express();

const PORT = 3000;

app.get("/api/health", (req, res) => {

  res.json({

    app: "Mr K POS",

    version: "2.0.0",

    status: "server online"

  });

});

app.listen(PORT, () => {

  console.log(`Mr K POS v2 server running on port ${PORT}`);

});
