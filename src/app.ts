import express, { type NextFunction, type Request, type Response } from "express";
import routes from './routes';
import { registerGlobalMiddlewares } from "./middleware/index.js";
import { register } from "./utils/metrics";

const app = express();
registerGlobalMiddlewares(app);



app.use('/api/v1', routes);

app.get('/metrics', async (req: Request, res: Response) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});



export default app;
