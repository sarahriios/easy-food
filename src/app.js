const express = require("express");
const cors = require("cors");
const path = require("path");

const restaurantRoutes = require("./modules/restaurant/restaurant.routes");
const authRoutes = require("./modules/auth/auth.routes")
const dishRoutes = require("./modules/dishes/dish.routes");
const { UPLOADS_ROOT, PUBLIC_PREFIX } = require("./modules/shared/image.service");

const app = express();

app.use(cors());
app.use(express.json());

app.use(express.static(path.join(__dirname, "../public")));


// Imagens enviadas ficam acessíveis pelo navegador: GET /uploads/...
app.use(PUBLIC_PREFIX, express.static(UPLOADS_ROOT));

app.use("/auth", authRoutes); 
app.use(dishRoutes);
app.use("/restaurants", restaurantRoutes);
    


module.exports = app;