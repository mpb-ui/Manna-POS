import {readFile} from 'node:fs/promises';
import readline from 'node:readline/promises';
import {decryptBackup} from '../lib/backups.js';

const file=process.argv[2];
if(!file){console.error('Pemakaian: npm run backup:verify -- /path/backup.mannabackup');process.exitCode=1;}
else{
  let terminal;
  try{
    let passphrase=process.env.MANNA_BACKUP_PASSPHRASE;
    if(!passphrase){
      if(!process.stdin.isTTY)throw new Error('Atur MANNA_BACKUP_PASSPHRASE melalui pengelola secret untuk verifikasi non-interaktif');
      terminal=readline.createInterface({input:process.stdin,output:process.stdout});
      // Do not echo the passphrase or accept it in a command-line argument.
      terminal.stdoutMuted=false;terminal._writeToOutput=function(value){if(!this.stdoutMuted)this.output.write(value);};
      process.stdout.write('Frasa sandi backup: ');terminal.stdoutMuted=true;passphrase=await terminal.question('');process.stdout.write('\n');
    }
    const archive=JSON.parse(await readFile(file,'utf8')),restored=await decryptBackup(archive,passphrase);
    console.log(JSON.stringify({ok:true,createdAt:restored.createdAt,checksumVerified:true,summary:restored.summary},null,2));
  }catch(error){console.error(error.message);process.exitCode=1;}finally{terminal?.close();}
}
