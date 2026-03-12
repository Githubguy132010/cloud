import { Hono } from 'hono';
import type { HonoContext } from './types';
import { pushRoute } from './routes/push';

const app = new Hono<HonoContext>();

app.get('/health', c => c.json({ ok: true }));
app.route('/push', pushRoute);

export default app;
