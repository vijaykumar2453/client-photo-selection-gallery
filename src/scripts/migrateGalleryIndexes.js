require("dotenv").config();

const mongoose = require("mongoose");
const connectDB = require("../config/database");
const ClientAccess = require("../models/clientAccess.model");
const Selection = require("../models/selection.model");

async function removeIndexIfPresent(collection, indexName) {
  const indexes = await collection.indexes();
  if (indexes.some(index => index.name === indexName)) {
    await collection.dropIndex(indexName);
    console.log(`Removed old index: ${indexName}`);
  }
}

async function migrateIndexes() {
  await connectDB();

  const collections = (await mongoose.connection.db.listCollections().toArray())
    .map(collection => collection.name);

  if (!collections.includes(ClientAccess.collection.collectionName)) {
    await ClientAccess.createCollection();
  }
  if (!collections.includes(Selection.collection.collectionName)) {
    await Selection.createCollection();
  }

  // Remove the old one-client-per-gallery and one-selection-per-gallery indexes.
  await removeIndexIfPresent(ClientAccess.collection, "galleryId_1");
  await removeIndexIfPresent(Selection.collection, "galleryId_1");
  await removeIndexIfPresent(Selection.collection, "clientAccessId_1");

  await ClientAccess.syncIndexes();
  await Selection.syncIndexes();

  console.log("Indexes updated");
}

migrateIndexes()
  .then(() => mongoose.disconnect())
  .catch(async error => {
    console.error("Migration failed:", error.message);
    await mongoose.disconnect();
    process.exit(1);
  });
