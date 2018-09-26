node ./dist/src/client/tools/host.js peer ^
--consensus dbft ^
--handler "./dist/demo/dbft/contract/handler.js" ^
--genesis "./demo/dbft/genesis" ^
--coinbase 1Je1wpeMJKCUQ7HMc7rk7HpnihumgcmyNg ^
--dataDir "./data/dbft/peer1" ^
--ignoreBan ^
--net bdt --host 0.0.0.0 --port 13000 --peerid peer1 --sn SN_PEER_TEST@106.75.173.166@12999@12998 ^
--rpchost localhost --rpcport 18089 %*