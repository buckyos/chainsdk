node ./dist/blockchain-sdk/src/tool/host.js miner ^
--genesis "./data/dpos/genesis_local" ^
--dataDir "./data/dpos/miner_local_2" ^
--loggerConsole --loggerLevel info ^
--minerSecret c07ad83d2c5627acece18312362271e22d7aeffb6e2a6e0ffe1107371514fdc2 ^
--rpchost localhost --rpcport 18088 ^
--net bdt --host 127.0.0.1 --port "13011|13001" --peerid local_miner2 --sn SN_PEER_LOCAL@127.0.0.1@10000@10001 --bdt_log_level info %* 
