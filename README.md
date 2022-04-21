Indexer that catches txs for specific contract(s)
=================================================

**This project is a copy of https://github.com/near-examples/indexer-tx-watcher-example but is migrated to [NEAR Lake Framework](https://github.com/near/near-lake-framework). We keep them both separately as they show different approaches to the same use case**

The most common use case for indexers is to react on a transaction sent to a specific contract or a list of contracts.

This project is trying to provide an example of the indexer described about. It's simple yet doing the necessary stuff. In this example we don't use any external storage (like database or files) to keep track for the transactions to keep the example as simple as possible.

We've tried to put the explanatory comments in the code to help developers to extend this example according to their needs.


> Please refer to [NEAR Indexer for Explorer](https://github.com/near/near-indexer-for-explorer) to find an inspiration for extending the indexer.


## How it works

Assuming we want to watch for transactions where a receiver account id is one of the provided in a list.
We pass the list of account ids (or contracts it is the same) via argument `--accounts`.
We want to catch all *successfull* transactions sent to one of the accounts from the list.
In the demo we'll just look for them and log them but it might and probably should be extended based on your needs.

---

## How to use

Before you proceed, make sure you have the following software installed:
* [rustup](https://rustup.rs/) or Rust version that is mentioned in `rust-toolchain` file in the root of [nearcore](https://github.com/nearprotocol/nearcore) project.

Clone this repository and open the project folder

```bash
$ git clone git@github.com:khorolets/indexer-tx-watcher-example.git
$ cd indexer-tx-watcher-example
```

### Run

```bash
$ cargo build --release
$ ./target/release/indexer-tx-watcher-example --accounts mycoolcontract.near,myanothercoolcontract.near --block-height 88088521 testnet
```

Provide your contracts list after `--accounts` key separated with comma (`,`) **avoid spaces**, pick a fresher block height on https://explorer.testnet.near.org/

---

Find more docs about indexers on https://near-indexers.io
