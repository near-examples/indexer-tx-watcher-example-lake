use std::collections::{HashMap, HashSet};
use std::str::FromStr;

use clap::Parser;
use tokio::sync::mpsc;

use near_lake_framework::near_indexer_primitives;

/// Command line arguments struct
#[derive(Parser, Debug, Clone)]
#[clap(version = "0.1")]
struct Opts {
    /// block height to start indexing from
    #[clap(long)]
    pub block_height: u64,
    /// account ids to watch for
    #[clap(long)]
    pub accounts: String,
}

#[tokio::main]
async fn main() -> Result<(), tokio::io::Error> {
    // Parse the command line arguments
    let opts: Opts = Opts::parse();

    // Configure the lake
    let lake_config = near_lake_framework::LakeConfigBuilder::default()
        .testnet()
        .start_block_height(opts.block_height)
        .build()
        .expect("Failed to build LakeConfig");

    // Get the list of accounts to watch from the command line arguments
    let watching_list = opts
        .accounts
        .split(',')
        .map(|elem| {
            near_indexer_primitives::types::AccountId::from_str(elem).expect("AccountId is invalid")
        })
        .collect();

    // Create the stream
    let (_, stream) = near_lake_framework::streamer(lake_config);

    // Start handling the stream
    listen_blocks(stream, watching_list).await;

    Ok(())
}

/// The main listener function the will be reading the stream of blocks `StreamerMessage`
async fn listen_blocks(
    mut stream: mpsc::Receiver<near_indexer_primitives::StreamerMessage>,
    watching_list: Vec<near_indexer_primitives::types::AccountId>,
) {
    // This will be a map of correspondence between transactions and receipts
    let mut tx_receipt_ids = HashMap::<String, String>::new();
    // This will be a list of receipt ids we're following
    let mut wanted_receipt_ids = HashSet::<String>::new();

    // Handle the messages from the stream
    while let Some(streamer_message) = stream.recv().await {
        parse_message(
            &streamer_message,
            &watching_list,
            &mut tx_receipt_ids,
            &mut wanted_receipt_ids,
        );
    }
}

/// The method that will be called for each message from the stream
fn parse_message(
    streamer_message: &near_indexer_primitives::StreamerMessage,
    watching_list: &[near_indexer_primitives::types::AccountId],
    tx_receipt_ids: &mut HashMap<String, String>,
    wanted_receipt_ids: &mut HashSet<String>,
) {
    eprintln!("Block height: {}", streamer_message.block.header.height);
    // Iterate over the shards in the block
    for shard in streamer_message.shards.clone() {
        let chunk = if let Some(chunk) = shard.chunk {
            chunk
        } else {
            continue;
        };

        // Iterate over the transactions in the chunk
        for transaction in chunk.transactions {
            // Check if transaction receiver id is one of the list we are interested in
            if is_tx_receiver_watched(&transaction, &watching_list) {
                // Extract receipt_id transaction was converted into
                let converted_into_receipt_id = transaction
                    .outcome
                    .execution_outcome
                    .outcome
                    .receipt_ids
                    .first()
                    .expect("`receipt_ids` must contain one Receipt Id")
                    .to_string();
                // Add `converted_into_receipt_id` to the list of receipt ids we are interested in
                wanted_receipt_ids.insert(converted_into_receipt_id.clone());
                // Add key value pair of transaction hash and in which receipt id it was converted for further lookup
                tx_receipt_ids.insert(
                    converted_into_receipt_id,
                    transaction.transaction.hash.to_string(),
                );
            }
        }

        // Iterate over the execution outcomes in the shard
        for execution_outcome in shard.receipt_execution_outcomes {
            // Check if the receipt id is in the list of receipt ids to track
            if let Some(receipt_id) =
                wanted_receipt_ids.take(&execution_outcome.receipt.receipt_id.to_string())
            {
                // Log the transaction hash, the receipt id and the status
                println!(
                    "\nTransaction hash {:?} related to {} executed with status {:?}",
                    tx_receipt_ids.get(receipt_id.as_str()),
                    &execution_outcome.receipt.receiver_id,
                    execution_outcome.execution_outcome.outcome.status
                );
                if let near_indexer_primitives::views::ReceiptEnumView::Action {
                    signer_id, ..
                } = &execution_outcome.receipt.receipt
                {
                    // Log the signer id
                    eprintln!("{}", signer_id);
                }

                if let near_indexer_primitives::views::ReceiptEnumView::Action { actions, .. } =
                    execution_outcome.receipt.receipt
                {
                    // Iterate over the actions in the receipt
                    for action in actions.iter() {
                        // If the action is a function call, log the decoded arguments
                        if let near_indexer_primitives::views::ActionView::FunctionCall {
                            args,
                            ..
                        } = action
                        {
                            if let Ok(args_json) =
                                serde_json::from_slice::<serde_json::Value>(&args)
                            {
                                eprintln!("{:#?}", args_json);
                            }
                        }
                    }
                }
                // Remove the receipt id from the map of receipt ids to transaction hashes because we have processed it
                tx_receipt_ids.remove(receipt_id.as_str());
            }
        }
    }
}

fn is_tx_receiver_watched(
    tx: &near_indexer_primitives::IndexerTransactionWithOutcome,
    watching_list: &[near_indexer_primitives::types::AccountId],
) -> bool {
    watching_list.contains(&tx.transaction.receiver_id)
}
