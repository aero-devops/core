let count = 0;
console.log('Aero demo service is ready.');
setInterval(() => {
  count += 1;
  console.log(`Heartbeat ${count}`);
}, 2000);
