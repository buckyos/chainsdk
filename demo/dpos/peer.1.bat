node32 ./dist/blockchain-sdk/src/tool/host.js peer ^
--genesis "./genesis" ^
--dataDir "./data/dpos/peertest1" ^
--loggerConsole --loggerLevel debug ^
--net bdt --host 0.0.0.0 --port "13011|13001" --peerid peer_test_1 --sn SN_PEER@106.75.173.166@24405@24406 --bdt_log_level debug ^
--rpchost localhost --rpcport 18089 %*