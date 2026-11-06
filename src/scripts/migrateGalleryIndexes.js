require("dotenv").config();

const mongoose = require("mongoose");
const connectDB = require("../config/database");
const ClientAccess = require("../models/clientAccess.model");
const Selection = require("../models/selection.model");
const Photo = require("../models/photo.model");

// Run with `npm run migrate-indexes` after deploying schema/index changes.
async function removeIndexIfPresent(collection, indexName) {
  const indexes = await collection.indexes();
  if (indexes.some(index => index.name === indexName)) {
    await collection.dropIndex(indexName);
    console.log(`Removed old index: ${indexName}`);
  }
}

async function migrateIndexes() {
  await connectDB();

  // Create collections before syncing indexes so a fresh database is handled as well.
  const collections = (await mongoose.connection.db.listCollections().toArray())
    .map(collection => collection.name);

  if (!collections.includes(ClientAccess.collection.collectionName)) {
    await ClientAccess.createCollection();
  }
  if (!collections.includes(Selection.collection.collectionName)) {
    await Selection.createCollection();
  }
  if (!collections.includes(Photo.collection.collectionName)) {
    await Photo.createCollection();
  }

  // Remove old uniqueness rules that prevented multiple clients and selections per gallery.
  await removeIndexIfPresent(ClientAccess.collection, "galleryId_1");
  await removeIndexIfPresent(Selection.collection, "galleryId_1");
  await removeIndexIfPresent(Selection.collection, "clientAccessId_1");

  await ClientAccess.syncIndexes();
  await Selection.syncIndexes();
  await Photo.syncIndexes();

  console.log("Indexes updated");
}

migrateIndexes()
  .then(() => mongoose.disconnect())
  .catch(async error => {
    console.error("Migration failed:", error.message);
    await mongoose.disconnect();
    process.exit(1);
  });
