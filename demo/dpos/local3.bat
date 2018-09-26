node ./dist/blockchain-sdk/src/tool/host.js miner ^
--genesis "./data/dpos/genesis_local" ^
--dataDir "./data/dpos/miner_local_3" ^
--loggerConsole --loggerLevel info ^
--minerSecret 9b55dea11fc216e768bf436d0efe9e734ec7bc9e575a935ae6203e5e99dae5ac ^
--rpchost localhost --rpcport 18087 ^
--net bdt --host 127.0.0.1 --port "13012|13002" --peerid local_miner3 --sn SN_PEER_LOCAL@127.0.0.1@10000@10001 --bdt_log_level info %* 
