node ./dist/blockchain-sdk/src/tool/host.js peer ^
--genesis "./data/coin3/genesis" ^
--dataDir "./data/coin3/peer" ^
--net bdt --host 127.0.0.1 --port "12314" --peerid 1EYLLvMtXGeiBJ7AZ6KJRP2BdAQ2Bof79 --sn SN_PEER_DBFT@127.0.0.1@12405@12406 --bdt_log_level info ^
--loggerConsole --loggerLevel debug