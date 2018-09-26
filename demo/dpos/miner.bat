node ./dist/blockchain-sdk/src/tool/host.js miner ^
--genesis "./genesis" ^
--dataDir "./data/dpos/miner1" ^
--loggerConsole --loggerLevel debug ^
--minerSecret e109b61f011c9939ac51808fac542b66fcb358f69bf710f5d11eb5d1f3e82bc3 ^
--rpchost localhost --rpcport 18089 ^
--net bdt --host 0.0.0.0 --port "13010|13000" --peerid wqs_miner1 --sn SN_PEER@106.75.173.166@24405@24406 --bdt_log_level debug %* 
