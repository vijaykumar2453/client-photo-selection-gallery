const express = require("express");
const path = require("path");

const authRoutes = require("./routes/auth.routes");
const galleryRoutes = require("./routes/gallery.routes");
const clientAccessRoutes = require("./routes/clientAccess.routes");
const photoRoutes = require("./routes/photo.routes");
const folderRoutes = require("./routes/folder.routes");
const selectionRoutes = require("./routes/selection.routes");
const { notFound, errorHandler } = require("./middleware/error.middleware");

const app = express();

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "../public")));

app.get("/", (req, res) => res.redirect("/admin/login"));
app.get("/admin/login", (req, res) => res.render("admin/login"));
app.get("/admin/dashboard", (req, res) => res.render("admin/dashboard"));
app.get("/admin/create-gallery", (req, res) => res.redirect("/admin/dashboard"));
app.get("/admin/selections/:galleryId", (req, res) =>
  res.render("admin/selections", { galleryId: req.params.galleryId })
);
app.get("/client/login/:token", (req, res) =>
  res.render("client/login", { token: req.params.token })
);
app.get("/client/gallery", (req, res) => res.render("client/gallery"));

app.use("/api/auth", authRoutes);
app.use("/api/galleries", galleryRoutes);
app.use("/api/client-access", clientAccessRoutes);
app.use("/api", photoRoutes);
app.use("/api", folderRoutes);
app.use("/api/selections", selectionRoutes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
