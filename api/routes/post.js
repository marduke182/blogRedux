import { Router as routerCreator} from 'express';
import { Post } from '../models';

const router = routerCreator();

router.get('/', (req, res) => {
  const tmp = Post.findPage();
  res.json({
    hello: 'world',
    tmp
  });
});


export default router;
