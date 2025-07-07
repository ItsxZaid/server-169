
import { Router } from "express";

import uiRouters from './ui';

const router = Router();

router.use('/ui', uiRouters);

export default router;