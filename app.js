
const electron = require('electron'),
      path = require('path'),
      fs = require('fs'),
      os= require('os'),
      http = require('http'),
      reader = require('xlsx');

var {
    app,
    BrowserWindow,
    ipcMain,
    shell
} = electron;

//routes
var {
    dashroutes
} = require('./js/routes.js');


var {aappuser} = require('./bin/repo/ds/users/vogel-users.js');

// Get WindowKey class
var {
    getProductCode,
    getProductSheets,
    WindowKey
} = require('./js/keymaker.js')

//Databases
var {
    dbtools
} = require('./db/dbsetup.js');


var curuse = {
    uinf: null, // current appuser
    uqdb: null,  // db file connected to user
    uquotes:null // array of quotes
};

// Set usersdb variable on load
// appuser() attempts to load the user of the this computer
var usersdb = ((au = aappuser())=>{
    this.cuser = au.cuser; //to keep the paths consistent incase a user signs in on a different computer
    this.droot ='C:/Dev/RESPRES/db/users/'; //path.join(au.cuser.spdrive, 'Vogel - Res HVAC');
    this.id = 'uname'; //unique value for

    this.rfrshdb = ()=>{
        if(this.db){this.db.loadDatabase();}
        else{return dbtools.LOADdb(this.droot + 'lists.db',this.id);}
    }

    this.db = this.rfrshdb();
    this.db.loadDatabase(); //refresh user file first time

    this.swtchuser = (rname)=>{
        let qlfileext = '-quotes.db';
        let qlid = 'id';
        return new Promise((resolve,reject)=>{
            this.db.findOne({uname:rname},(err,doc)=>{
                if(doc){ //desired user IS a user already
                    console.log(doc);
                    console.log('Found User...');
                    curuse.uinf = doc;
                    //curuse.uinf.cuser
                    curuse.uqdb = dbtools.LOADdb(this.droot + curuse.uinf.uname + qlfileext, qlid);
                    curuse.uqdb.find({},(err,docs)=>{ //load the users quotes to array
                        if(docs){
                            curuse.uquotes = docs;
                        }else{
                            curuse.uquotes = null;
                        }
                        resolve(curuse);
                    });

                }else{ //desired user ISNOT a user
                    /* IF a user is not in the user list

                    */
                    this.db.insert(aappuser({uname:rname}),(err,doc)=>{
                        if(doc){
                            curuse.uinf = doc;
                            curuse.uqdb = dbtools.LOADdb(this.droot + curuse.uinf.uname + qlfileext,qlid);
                        }
                        resolve(curuse);
                    });
                }
            });
        });
    }
    this.swtchuser(au.uname);

    return this;
})();

let tuser = aappuser();
let winkey = new WindowKey(
    getProductSheets(
        getProductCode('windows'),
        reader.readFile(tuser.cuser.spdrive + '/Vogel - Bldg Env/Pricing Files/Price Book.xlsx')
    )
);

var mainview;
var loadAwindow = (fpath,w =1500 ,h=1500,close=false,menubar=false)=>{
    let nwin = new BrowserWindow({
            webPreferences:{
                nodeIntegration:true,
                contextIsolation:false
            },
            width:w,
            height:h,
            autoHideMenuBar:menubar
        });
        nwin.set
        nwin.loadURL(fpath);
        if(close){
            nwin.on('close',(eve)=>{
                console.log('App closed from page: fpath');
                app.exit();
            });
        }
    return nwin;
}

console.log(tuser);

app.on('ready',(eve)=>{
  // Use default printing options
   mainview = loadAwindow(path.join(__dirname,'./controllers/winquoter.html'),1500,1500,true,true); // CONNECTION FOR DEV >> usersdb.cuser.spdrive,'Vogel - IM/dev/Projects/BEEQ/controllers/winquoter.html'),1500,1500,true);
});

ipcMain.on('print-screen',(eve)=>{
  //const pdfPath = path.join(os.homedir(), '/Desktop/temp/print.pdf');
  const pdfPath = path.join(os.tmpdir(),'print.pdf');
  let win = BrowserWindow.fromWebContents(eve.sender);
  win.webContents.printToPDF({printBackground:true}).then(data => {
    fs.writeFile(pdfPath, data, (error) => {
      if (error) throw error
      console.log(`Wrote PDF successfully to ${pdfPath}`)
      shell.openExternal('file://'+pdfPath);
    })
  }).catch(error => {
    console.log(`Failed to write PDF to ${pdfPath}: `, error)
  })
 })

ipcMain.on(dashroutes.getkey,(eve,data)=>{
  if(data == 'REFRESH'){
    console.log(data);
    delete winkey;
    winkey = new WindowKey(
      getProductSheets(
          getProductCode('windows'),
          reader.readFile(tuser.cuser.spdrive + '/Vogel - Bldg Env/Pricing Files/Price Book.xlsx')
      )
  );

  }
    if(winkey.key){
        eve.sender.send(dashroutes.getkey,winkey.key); //send the entire object to the page
    }else{eve.sender.send(dashroutes,null);}
});

/* GET Quotes
    request ALL the quotes in database

    loops through all the available user quote
     files and sends them to the dash.
*/
ipcMain.on(dashroutes.getquotes,(eve,data)=>{

});

/* GET User Quotes

    request a user's quotes from database
    RECIEVE:
        - data = user name

    sends the information in the format of
    UQuote(). this is slightly different
    this is like the user created on this
    file, with the addition of a quotes[]
    to hold all the user quotes
*/
ipcMain.on(dashroutes.getuser,(eve,data)=>{
    let uq;
    if(data == curuse.uinf.uname){
        uq = UQuote(curuse.uquotes);
        uq.uname = curuse.uinf.uname;
        eve.sender.send(dashroutes.getuser,uq);
    }else if(data){
        usersdb.swtchuser(data).then((res)=>{
            uq = UQuote(res.uquotes);
            uq.uname = res.uinf.uname;
            eve.sender.send(dashroutes.getuser,uq);
        });
    }else{
        console.log('null was sent');
        eve.sender.send(dashroutes.getuser,null);
    }
});


var quoterviews = []; //array of BrowserWindow object

/* Get a new quote for a user
    RECIEVE:
*/
ipcMain.on(dashroutes.openquote,(eve,data)=>{
    //need to see if the quote is already open when selected
    quoterviews.push({
        name: data.id,
        tview: loadAwindow(path.join(__dirname,'/controllers/winquoter.html'),1500,1500)
    });
});
