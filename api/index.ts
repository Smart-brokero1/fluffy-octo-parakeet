import express from "express";

const app = express();

app.use(express.json());

// Simple auth middleware
const adminAuth = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const password = req.headers['x-admin-password'];
  if (password === (process.env.ADMIN_PASSWORD || "admin123")) {
    next();
  } else {
    res.status(401).json({ error: "Unauthorized access detected." });
  }
};

// Auth endpoint
app.post("/api/admin/login", (req, res) => {
  const { password } = req.body;
  if (password === (process.env.ADMIN_PASSWORD || "admin123")) {
    res.json({ success: true });
  } else {
    res.status(401).json({ error: "Invalid credentials" });
  }
});

// In-memory data store (resets on cold start!)
let shipments = [
  {
    id: "TRK-1001",
    customerName: "Alice Johnson",
    packageName: "Industrial Laser Array",
    origin: { lat: 34.0522, lng: -118.2437, name: "Los Angeles Warehouse" }, // LA
    destination: { lat: 37.7749, lng: -122.4194, name: "San Francisco Office" }, // SF
    progress: 45,
    status: "In Transit",
    timeline: [
      { status: "Order Processed", time: "2024-05-14 08:00 AM" },
      { status: "Shipped from Origin", time: "2024-05-14 10:30 AM" },
      { status: "In Transit", time: "2024-05-15 11:00 AM" },
    ],
  }
];

// API Routes
app.get("/api/shipments", adminAuth, (req, res) => {
  res.json(shipments);
});

app.get("/api/track/:id", (req, res) => {
  const shipment = shipments.find(s => s.id === req.params.id);
  if (shipment) {
    res.json(shipment);
  } else {
    res.status(404).json({ error: "Shipment not found" });
  }
});

app.post("/api/shipments", adminAuth, (req, res) => {
  const newShipment = {
    id: `TRK-${Math.floor(1000 + Math.random() * 9000)}`,
    ...req.body,
    progress: 0,
    timeline: [{ status: "Order Processed", time: new Date().toLocaleString() }],
  };
  shipments.push(newShipment);
  res.json(newShipment);
});

app.patch("/api/track/:id", adminAuth, (req, res) => {
  const { progress, status } = req.body;
  const index = shipments.findIndex(s => s.id === req.params.id);
  if (index !== -1) {
    shipments[index] = { ...shipments[index], progress: progress ?? shipments[index].progress };
    if (status) {
      shipments[index].status = status;
      shipments[index].timeline.push({ status, time: new Date().toLocaleString() });
    }
    // Note: Vercel Serverless Functions don't support Socket.io, so this won't broadcast.
    res.json(shipments[index]);
  } else {
    res.status(404).json({ error: "Shipment not found" });
  }
});

export default app;