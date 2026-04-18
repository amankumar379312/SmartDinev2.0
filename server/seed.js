require('dotenv').config();
const connectDB = require('./config/db');
const Table = require('./models/Table');
const MenuItem = require('./models/MenuItem');

async function seed() {
  await connectDB(process.env.MONGO_URI);
  await Table.deleteMany({});
  const tables = [];
  for (let i = 1; i <= 15; i++) {
    tables.push({ tableId: `T-${String(i).padStart(2, '0')}`, number: i, seats: 4, status: 'available' });
  }
  await Table.insertMany(tables);
  await MenuItem.deleteMany({});
  await MenuItem.insertMany([
    { name: 'Margherita Pizza', price: 250, category: 'Pizza', popularityScore: 9 },
    { name: 'Paneer Butter Masala', price: 220, category: 'Main', popularityScore: 8 },
    { name: 'French Fries', price: 120, category: 'Sides', popularityScore: 7 },
    // ... add more
  ]);
  console.log('Seed done');
  process.exit(0);
}

seed();
