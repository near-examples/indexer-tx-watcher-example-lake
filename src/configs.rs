use clap::Clap;

use tracing_subscriber::EnvFilter;

/// NEAR Indexer Example
/// Watches for stream of blocks from the chain
#[derive(Clap, Debug, Clone)]
#[clap(version = "0.1", author = "Near Inc. <hello@nearprotocol.com>")]
pub(crate) struct Opts {
    /// block height to start indexing from
    #[clap(long)]
    pub block_height: u64,
    /// account ids to watch for
    #[clap(long)]
    pub accounts: String,
    #[clap(subcommand)]
    pub subcmd: SubCommand,
}

#[derive(Clap, Debug, Clone)]
pub(crate) enum SubCommand {
    Mainnet,
    Testnet,
}

pub(crate) fn init_logging() {
    let env_filter = EnvFilter::new("near_lake_framework=info");
    tracing_subscriber::fmt::Subscriber::builder()
        .with_env_filter(env_filter)
        .with_writer(std::io::stderr)
        .init();
}

impl From<Opts> for near_lake_framework::LakeConfig {
    fn from(opts: Opts) -> Self {
        let s3_bucket_name: String = match &opts.subcmd {
            SubCommand::Mainnet => "near-lake-data-mainnet",
            SubCommand::Testnet => "near-lake-data-testnet",
        }
        .into();

        near_lake_framework::LakeConfig {
            s3_endpoint: None,
            s3_region_name: "eu-central1".to_string(),
            start_block_height: opts.block_height,
            s3_bucket_name,
        }
    }
}
