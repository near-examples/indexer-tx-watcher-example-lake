import { startStream, types } from '@near-lake/framework';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

const lakeConfig: types.LakeConfig = {
    s3BucketName: "near-lake-data-testnet", // "near-lake-data-mainnet" for the mainnet
    s3RegionName: "eu-central-1",
    startBlockHeight: 214692855,
};

const argv = yargs(hideBin(process.argv)).parse();
const watchingAccounts = argv.accounts;

const txReceiptIds = {};
const wantedReceiptIds = [];

async function listenBlocks(
  block: types.Block,
  context: types.LakeContext
): Promise<void> {
  console.log(`Block height: ${block.header().height}`); 
  for (const shard of block.streamerMessage.shards) {
    const chunk = shard.chunk;
    for (const transaction of chunk.transactions) {
      // Check if transaction receiver id is one of the list we are interested in
      if (isTxReceiverWatched(transaction.transaction.receiverId, watchingAccounts)) {
        const receiptId = transaction.outcome.executionOutcome.outcome.receiptIds[0];
        wantedReceiptIds.push(receiptId);
        txReceiptIds[receiptId] = transaction.transaction.hash;
      }
    }

    for (const executionOutcome of shard.receiptExecutionOutcomes) {
      if (wantedReceiptIds.includes(executionOutcome.receipt.receiptId)) {
        const receiptIdIdx = wantedReceiptIds.indexOf(executionOutcome.receipt.receiptId);
        wantedReceiptIds.splice(receiptIdIdx, 1);

        let status: string;

        if (typeof executionOutcome.executionOutcome.outcome.status === 'string') {
          status = 'Postponed';
        } else if ('SuccessValue' in executionOutcome.executionOutcome.outcome.status) {
          status = 'SuccessValue';
        } else if ('SuccessReceiptId' in executionOutcome.executionOutcome.outcome.status) {
          status = 'SuccessReceiptId';
        } else if ('Failure' in executionOutcome.executionOutcome.outcome.status) {
          status = 'Failure';
        } else {
          status = 'Unknown';
        }

        console.log(`\tTransaction hash ${txReceiptIds[executionOutcome.receipt.receiptId]} related to ${executionOutcome.receipt.receiptId} executed with status \"${status}\"`);

        if ('Action' in executionOutcome.receipt.receipt) {
          console.log(`\t${executionOutcome.receipt.receipt.Action.signerId}`);

          for (const action of executionOutcome.receipt.receipt.Action.actions) {
            if (typeof action === 'object' && action !== null && 'FunctionCall' in action) {
              const decodedArgs = Buffer.from(action.FunctionCall.args, 'base64').toString('utf-8');
              console.log(`\t${decodedArgs}\n`);
            }
          }
        } 

        delete txReceiptIds[executionOutcome.receipt.receiptId];
      }
    }
  }
}

function isTxReceiverWatched(
  receiverId: string,
  watchingAccounts: string[],
): boolean {
  return watchingAccounts.includes(receiverId);
}

(async () => {
    await startStream(lakeConfig, listenBlocks);
})();
