import express from "express";
import path from "path";
import { createServer } from "http";
import { Server } from "socket.io";
import { createServer as createViteServer } from "vite";
import { put, list } from "@vercel/blob";

async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: "*",
    },
  });

  const PORT = 3000;

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

  // Default data
  const defaultShipments = [
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

  // In-memory fallback
  let memoryShipments = [...defaultShipments];

  // Helper to get shipments
  async function getShipments() {
    try {
      if (process.env.BLOB_READ_WRITE_TOKEN) {
        const { blobs } = await list({ prefix: 'shipments.json' });
        if (blobs.length > 0) {
          const response = await fetch(`${blobs[0].url}?t=${Date.now()}`, { cache: 'no-store' });
          const data = await response.json();
          if (Array.isArray(data)) {
            return data as any[];
          }
        }
      }
    } catch (error) {
      console.error("Blob get error:", error);
    }
    return memoryShipments;
  }

  // Helper to save shipments
  async function saveShipments(shipments: any[]) {
    memoryShipments = shipments;
    try {
      if (process.env.BLOB_READ_WRITE_TOKEN) {
        await put('shipments.json', JSON.stringify(shipments), {
          access: 'public',
          addRandomSuffix: false
        });
      }
    } catch (error) {
      console.error("Blob set error:", error);
    }
  }

  // API Routes
  app.get("/api/shipments", adminAuth, async (req, res) => {
    const shipments = await getShipments();
    res.json(shipments);
  });

  app.get("/api/track/:id", async (req, res) => {
    const shipments = await getShipments();
    const shipment = shipments.find((s: any) => s.id === req.params.id);
    if (shipment) {
      res.json(shipment);
    } else {
      res.status(404).json({ error: "Shipment not found" });
    }
  });

  app.post("/api/shipments", adminAuth, async (req, res) => {
    const shipments = await getShipments();
    const newShipment = {
      id: `TRK-${Math.floor(1000 + Math.random() * 9000)}`,
      ...req.body,
      progress: 0,
      timeline: [{ status: "Order Processed", time: new Date().toLocaleString() }],
    };
    shipments.push(newShipment);
    await saveShipments(shipments);
    res.json(newShipment);
  });

  app.patch("/api/track/:id", adminAuth, async (req, res) => {
    const shipments = await getShipments();
    const { progress, status } = req.body;
    const index = shipments.findIndex((s: any) => s.id === req.params.id);
    if (index !== -1) {
      shipments[index] = { ...shipments[index], progress: progress ?? shipments[index].progress };
      if (status) {
        shipments[index].status = status;
        shipments[index].timeline.push({ status, time: new Date().toLocaleString() });
      }
      await saveShipments(shipments);
      // Broadcast update via Socket.io
      io.emit(`shipment_update:${req.params.id}`, shipments[index]);
      res.json(shipments[index]);
    } else {
      res.status(404).json({ error: "Shipment not found" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
