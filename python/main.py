import asyncio
import os
import argparse
import base64
import json

from near_lake_framework import LakeConfig, streamer, Network


async def main():
    # Parse command line arguments
    parser = argparse.ArgumentParser(description='NEAR Lake Framework Indexer')
    parser.add_argument('--accounts', type=str, help='Comma-separated list of accounts to filter')
    parser.add_argument('--block-height', type=int, help='Starting block height')

    args = parser.parse_args()
    start_height = args.block_height

    # Configure the lake
    config = LakeConfig(
        network=Network.TESTNET,
        aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID"),
        aws_secret_key=os.getenv("AWS_SECRET_ACCESS_KEY"),
        start_block_height=start_height
    )
    config.s3_bucket_name = "near-lake-data-testnet"
    config.s3_region_name = "eu-central-1"

    # Get the list of accounts to watch from the command line arguments
    watching_accounts = [acc.strip() for acc in args.accounts.split(',')]

    # Create the stream
    stream_handle, streamer_messages_queue = streamer(config)

    # Start handling the stream
    await listen_blocks(streamer_messages_queue, watching_accounts)


async def listen_blocks(streamer_messages_queue, watching_accounts):
    # Dictionary to map the transaction receipt ids to the transaction hash we should track
    tx_receipt_ids = {}
    # List of receipt ids to track
    wanted_receipt_ids = []

    while True:
        streamer_message = await streamer_messages_queue.get()
        parse_message(streamer_message, watching_accounts, tx_receipt_ids, wanted_receipt_ids)


def parse_message(streamer_message, watching_accounts, tx_receipt_ids, wanted_receipt_ids):
    print(f"Block height: {streamer_message.block.header.height}")

    # Iterate over the shards in the block
    for shard in streamer_message.shards:
        chunk = shard.chunk
        # Iterate over the transactions in the chunk
        for tx in chunk.transactions:
            if tx.transaction.receiver_id in watching_accounts:
                # Extract receipt_id transaction was converted into
                receipt_id = tx.outcome.execution_outcome.outcome.receipt_ids[0]
                # Add receipt id to the list of receipt ids we are interested in
                wanted_receipt_ids.append(receipt_id)
                # Add key value pair of transaction hash and in which receipt id it was converted for further lookup
                tx_receipt_ids[receipt_id] = tx.transaction.hash

        # Iterate over the execution outcomes in the shard
        for execution_outcome in shard.receipt_execution_outcomes:
            # Check if the receipt id is in the list of receipt ids to track
            if execution_outcome.receipt.receipt_id in wanted_receipt_ids:
                # Remove the receipt id from the list of receipt ids because we have processed it
                wanted_receipt_ids.remove(execution_outcome.receipt.receipt_id)

                if isinstance(execution_outcome.execution_outcome.outcome.status, str):
                  status = 'Postponed'
                elif 'SuccessValue' in execution_outcome.execution_outcome.outcome.status:
                  status = 'SuccessValue'
                elif 'SuccessReceiptId' in execution_outcome.execution_outcome.outcome.status:
                  status = 'SuccessReceiptId'
                elif 'Failure' in execution_outcome.execution_outcome.outcome.status:
                  status = 'Failure'
                else:
                  status = 'Unknown'

                # Log the transaction hash, the receipt id and the status
                print(f"Transaction hash {tx_receipt_ids[execution_outcome.receipt.receipt_id]} related to {execution_outcome.receipt.receipt_id} executed with status {status}")

                if ('Action' in execution_outcome.receipt.receipt):
                  # Log the signer id
                  print(execution_outcome.receipt.receipt['Action']['signer_id'])

                  # Iterate over the actions in the receipt
                  for action in execution_outcome.receipt.receipt['Action']['actions']:
                    # If the action is a function call, log the decoded arguments
                    if action['FunctionCall']:
                      decoded_args = json.loads(base64.b64decode(action['FunctionCall']['args']))
                      print(decoded_args)

if __name__ == "__main__":
    asyncio.run(main())
