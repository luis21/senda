import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {createHash} from 'node:crypto';
import {connect} from './helpers/cdp.mjs';

test('decodes a 127-byte response without confusing frame-length encodings', async () => {
  const server=http.createServer();
  const peers=new Set();
  server.on('upgrade',(req,socket)=>{
    peers.add(socket);
    const accept=createHash('sha1').update(req.headers['sec-websocket-key']+'258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
    socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: '+accept+'\r\n\r\n');
    socket.once('data',()=>{
      const body=Buffer.from(JSON.stringify({id:1,result:{value:'a'.repeat(97)}}));
      assert.equal(body.length,127);
      socket.write(Buffer.concat([Buffer.from([0x81,0x7e,0x00,0x7f]),body]));
    });
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  let client, timeout;
  try {
    client=await connect(server.address().port,'/');
    const result=await Promise.race([client.send('Test.frame'),new Promise((_,reject)=>{timeout=setTimeout(()=>reject(Error('127-byte response was not decoded')),1000);})]);
    assert.equal(result.value,'a'.repeat(97));
  } finally {
    clearTimeout(timeout);client?.close();for(const socket of peers)socket.destroy();
    await new Promise(resolve=>server.close(resolve));
  }
});
