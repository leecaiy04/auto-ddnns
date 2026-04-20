#!/usr/bin/env node
/**
 * 状态路由
 */

export default function createStatusRoutes(modules) {
  const router = express.Router();

  // 获取整体状态
  router.get('/', async (req, res) => {
    try {
      const state = modules.stateManager.getState();
      const uptime = Math.floor((Date.now() - new Date(state.startTime)) / 1000);

      res.json({
        status: 'healthy',
        uptime,
        startTime: state.startTime,
        lastUpdate: state.lastUpdate,
        modules: {
          router: modules.router?.currentIP ? 'ok' : 'unknown',
          ddns: modules.ddns ? 'ok' : 'disabled',
          lucky: modules.lucky ? 'ok' : 'disabled',
          sunpanel: modules.sunpanel ? 'ok' : 'disabled'
        }
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}
