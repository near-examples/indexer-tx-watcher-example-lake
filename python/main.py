import asyncio
import os
import argparse

from near_lake_framework import LakeConfig, streamer, Network


async def main():    
    parser = argparse.ArgumentParser(description='NEAR Lake Framework Indexer')
    parser.add_argument('--accounts', type=str, help='Comma-separated list of accounts to filter')
    parser.add_argument('--block-height', type=int, help='Starting block height')
    
    args = parser.parse_args()

    start_height = args.block_height if args.block_height else 214692855
    config = LakeConfig(
        network=Network.TESTNET,
        aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID"),
        aws_secret_key=os.getenv("AWS_SECRET_ACCESS_KEY"),
        start_block_height=start_height
    )
    config.s3_bucket_name = "near-lake-data-testnet"
    config.s3_region_name = "eu-central-1"

    target_accounts = []
    if args.accounts:
        target_accounts = [acc.strip() for acc in args.accounts.split(',')]
        print(f"Filtering for accounts: {target_accounts}")

    stream_handle, streamer_messages_queue = streamer(config)
    
    print(f"Starting indexer from block height: {config.start_block_height}")
    
    while True:
        streamer_message = await streamer_messages_queue.get()
        block_height = streamer_message.block.header.height
        
        if target_accounts:
            found_accounts = set()
            for shard in streamer_message.shards:
                if shard.chunk and shard.chunk.transactions:
                    for tx in shard.chunk.transactions:
                        if tx.transaction.signer_id in target_accounts:
                            found_accounts.add(tx.transaction.signer_id)
                        if tx.transaction.receiver_id in target_accounts:
                            found_accounts.add(tx.transaction.receiver_id)
            
            if found_accounts:
                print(f"Block #{block_height} - Found target accounts: {found_accounts}")
        else:
            print(f"Block #{block_height} Shards: {len(streamer_message.shards)}")

if __name__ == "__main__":
    asyncio.run(main())