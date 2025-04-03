# jupultra


1. **Clone the Repository**
   ```bash
   git clone https://github.com/zacnider/jupultra.git
   cd jupultra
   ```
2. **Set rpc and private**
   ```bash
   nano .env  
   ```
3. **Create and Use Screen**
   ```bash
   screen -S bot
   to continue the currently open screen
   screen -R bot
   to exit the screen Ctrl+a+d
   ```
4. **Run the Application**
   ```bash
   node main.js
   ```

## If it doesn't work install these

```bash
sudo apt update && sudo apt upgrade -y
```
```bash
npm install @solana/web3.js@latest node-fetch@2 dotenv
```
```bash
sudo apt install git
```
