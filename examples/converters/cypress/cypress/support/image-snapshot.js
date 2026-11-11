import { addMatchImageSnapshotCommand } from '@simonsmith/cypress-image-snapshot/command';

addMatchImageSnapshotCommand({
  failureThreshold: 0,
  failureThresholdType: 'pixel',
  storeReceivedOnFailure: true,
});
