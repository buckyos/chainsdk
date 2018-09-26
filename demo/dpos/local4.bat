node ./dist/blockchain-sdk/src/tool/host.js miner ^
--genesis "./data/dpos/genesis_local" ^
--dataDir "./data/dpos/miner_local_4" ^
--loggerConsole --loggerLevel info ^
--minerSecret e109b61f011c9939ac51808fac542b66fcb358f69bf710f5d11eb5d1f3e82bc3 ^
--rpchost localhost --rpcport 18086 ^
--net bdt --host 127.0.0.1 --port "13013|13003" --peerid local_miner4 --sn SN_PEER_LOCAL@127.0.0.1@10000@10001 --bdt_log_level info %* 
