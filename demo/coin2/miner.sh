nohup node ./dist/blockchain-sdk/src/tool/host.js miner \
--genesis "./data/coin/genesis" \
--dataDir "./data/coin/miner" \
--minerSecret 2f1e50c401433c9d514a2d2fa5cf90c648aaa9cf5790984de7288be3fab9035f \
--net tcp --host localhost --port 12312 \
--rpchost localhost --rpcport 18089 \
--loggerConsole --loggerLevel debug \
--feelimit 10 $* > console.log &