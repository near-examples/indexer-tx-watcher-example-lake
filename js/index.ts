import { startStream, types } from '@near-lake/framework';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

// Parse command line arguments
const argv = yargs(hideBin(process.argv)).parse();
const blockHeight = argv.blockHeight;

// Configure the lake
const lakeConfig: types.LakeConfig = {
    s3BucketName: "near-lake-data-testnet", // "near-lake-data-mainnet" for the mainnet
    s3RegionName: "eu-central-1",
    startBlockHeight: blockHeight,
};

// Get the list of accounts to watch from the command line arguments
const watchingAccounts = argv.accounts;

// Object to map the transaction receipt ids to the transaction hash we should track
const txReceiptIds = {};
// List of receipt ids to track
const wantedReceiptIds = [];

async function parseMessage(
  block: types.Block,
  /* context: types.LakeContext */ // In this case we don't use the context, but it is available if needed
): Promise<void> {
  console.log(`Block height: ${block.header().height}`); 
  // Iterate over the shards in the block
  for (const shard of block.streamerMessage.shards) {
    const chunk = shard.chunk;
    // Iterate over the transactions in the chunk
    for (const transaction of chunk.transactions) {
      // Check if transaction receiver id is one of the list we are interested in
      if (isTxReceiverWatched(transaction.transaction.receiverId, watchingAccounts)) {
        // Extract receipt_id transaction was converted into
        const receiptId = transaction.outcome.executionOutcome.outcome.receiptIds[0];
        // Add receipt id to the list of receipt ids we are interested in
        wantedReceiptIds.push(receiptId);
        // Add key value pair of transaction hash and in which receipt id it was converted for further lookup
        txReceiptIds[receiptId] = transaction.transaction.hash;
      }
    }
    // Iterate over the execution outcomes in the shard
    for (const executionOutcome of shard.receiptExecutionOutcomes) {
      // Check if the receipt id is in the list of receipt ids to track
      if (wantedReceiptIds.includes(executionOutcome.receipt.receiptId)) {
        const receiptIdIdx = wantedReceiptIds.indexOf(executionOutcome.receipt.receiptId);
        // Remove the receipt id from the list of receipt ids because we have processed it
        wantedReceiptIds.splice(receiptIdIdx, 1);
        
        // Get the status of the execution outcome
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

        // Log the transaction hash, the receipt id and the status
        console.log(`\nTransaction hash ${txReceiptIds[executionOutcome.receipt.receiptId]} related to ${executionOutcome.receipt.receiptId} executed with status \"${status}\"`);

        if ('Action' in executionOutcome.receipt.receipt) {
          // Log the signer id
          console.log(`${executionOutcome.receipt.receipt.Action.signerId}`);

          // Iterate over the actions in the receipt
          for (const action of executionOutcome.receipt.receipt.Action.actions) {
            // If the action is a function call, log the decoded arguments
            if (typeof action === 'object' && action !== null && 'FunctionCall' in action) {
              const decodedArgs = Buffer.from(action.FunctionCall.args, 'base64').toString('utf-8');
              console.log(`${decodedArgs}`);
            }
          }
        } 

        // Remove the receipt id from the map of receipt ids to transaction hashes because we have processed it
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

// Start the stream
(async () => {
    await startStream(lakeConfig, parseMessage);
})();
