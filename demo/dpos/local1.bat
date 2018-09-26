node ./dist/blockchain-sdk/src/tool/host.js miner ^
--genesis "./data/dpos/genesis_local" ^
--dataDir "./data/dpos/miner_local_1" ^
--loggerConsole --loggerLevel info ^
--minerSecret 64d8284297f40dc7475b4e53eb72bc052b41bef62fecbd3d12c5e99b623cfc11 ^
--rpchost localhost --rpcport 18089 ^
--genesisMiner ^
--net bdt --host 127.0.0.1 --port "13010|13000" --peerid local_miner1 --sn SN_PEER_LOCAL@127.0.0.1@10000@10001 --bdt_log_level info %* 
