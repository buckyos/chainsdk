node ./dist/blockchain-sdk/src/tool/host.js miner ^
--genesis "./demo/dpos/genesis" ^
--dataDir "./data/dpos/miner1" ^
--loggerConsole --loggerLevel debug ^
--minerSecret c07ad83d2c5627acece18312362271e22d7aeffb6e2a6e0ffe1107371514fdc2 ^
--feelimit 10 ^
--net bdt --host 0.0.0.0 --port "0|13001" --peerid miner2 --sn SN_PEER_TEST@106.75.173.166@12999@12998 --bdt_log_level info %*