node ./dist/blockchain-sdk/src/tool/host.js miner ^
--genesis "./data/dbft/genesis" ^
--dataDir "./data/dbft/miner1" ^
--loggerConsole --loggerLevel debug ^
--minerSecret e109b61f011c9939ac51808fac542b66fcb358f69bf710f5d11eb5d1f3e82bc3 ^
--ignoreBan ^
--feelimit 10 ^
--net bdt --host 0.0.0.0 --port "0|13001" --peerid 13CS9dBwmaboedj2hPWx6Dgzt4cowWWoNZ --sn SN_PEER_TEST@106.75.173.166@12999@12998 --bdt_log_level debug --rpchost localhost --rpcport 18089 %*