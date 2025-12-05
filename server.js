// 1. Start Express server
const express = require('express');
const app = express();

app.get('/', (req, res) => {
  const now = new Date().toLocaleTimeString();
  res.send(`✅ Alive at ${now}`);
});

// 2. Keep awake with internal ping
setInterval(() => {
  console.log('💓 Ping at:', new Date().toLocaleTimeString());
}, 5 * 60 * 1000); // Every 5 minutes

// 3. Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server started on port ${PORT}`);
});
