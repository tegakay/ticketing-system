import express, { type NextFunction, type Request, type Response } from "express";
import routes from './routes';
import { registerGlobalMiddlewares } from "./middleware/index.js";

const app = express();
registerGlobalMiddlewares(app);



app.use('/api/v1', routes);

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});



export default app;
