
import { Worker } from 'bullmq';
import { getRedisConnection } from '../queue/queue.service'; // your earlier queue wrapper
import { DocumentsWorker } from '@app/workers/documents.worker';

async function start() {
  const workerInstance = await DocumentsWorker.create();
  const connection = getRedisConnection();

  // Register Bull worker that delegates to our DocumentsWorker.handle
  const w = new Worker('documents', async job => {
    const bookingId = job.data.bookingId;
    return workerInstance.handle(bookingId);
  }, { connection });

  w.on('completed', job => console.log('Job completed', job.id));
  w.on('failed', (job, err) => console.error('Job failed', job?.id, err));
}

start().catch(err => {
  console.error(err);
  process.exit(1);
});
