// Log utilities.
const dbLogsEl = document.querySelector("#indexed-logs");

document.querySelector("#clear-logs").onclick = () => {
  dbLogsEl.innerText = "";
};

const dbLog = (...args) => {
  dbLogsEl.innerText += '\n' + args.join(" ");
};


// IndexedDB initializations.
var db;
const dbReq = indexedDB.open("tempFilesDB", 3);

dbReq.onerror = evt => {
  dbLog(`ERROR: Fail to open indexedDB 'tempFilesDB' db: ${evt.target.error.message}`);
};

dbReq.onupgradeneeded = () => {
  const db = dbReq.result;

  dbLog(`Upgrade tempFilesDB.`);

    if (!db.objectStoreNames.contains("tempFiles")) {
    db.createObjectStore("tempFiles");
  }
};

function clear() {
    const transaction = db.transaction(["tempFiles"], "readwrite");
    const objectStore = transaction.objectStore("tempFiles");
    const dbRequest = objectStore.getAllKeys();
    dbRequest.onsuccess = (evt) => {
        dbLog(`Existing files:\n${evt.target.result.join('\n')}`);

        let clearReq = objectStore.clear();
        clearReq.onsuccess = () => {
            dbLog("DB cleared");
        }
        clearReq.onerror = () => {
            dbLog("DB clear failure",clearReq.error.message);
        }
    };
}

dbReq.onsuccess = () => {
  db = dbReq.result;

  dbLog(`Opened tempFiles db.`);

  clear();

  db.onerror = evt => {
    dbLog(`Error during indexedDB operation: ${evt.target.error.message}`);
  };

    const transaction = db.transaction(["tempFiles"]);
    const objectStore = transaction.objectStore("tempFiles");
    const dbRequest = objectStore.getAllKeys();
    dbRequest.onsuccess = (evt) => {
        //dbLog(`Temp files:\n${evt.target.result.join('\n')}`);
        evt.target.result.forEach((file) => {
            dbLog(`Temp file: ${file}`);
        });
    };

};



// Keep a reference to the last created temp file,
// the file will be garbage collected once it is not
// referenced anymore.
var tempFile;

function assertDefined(val, msg) {
  if (!val) {
    dbLog(msg);
    throw new Error(msg);
  }
}

function assertIndexedDBReady() {
  assertDefined(db, `The expected IndexedDB is not currently opened`);
}

function assertOpenedFileReady() {
  assertDefined(tempFile, `The expected tempFile object is not currently opened`);
}

// Handle the create file button.
document.querySelector("#create-file").addEventListener("click", () => {
  assertIndexedDBReady();

  // Create a new mutable file.
  const tempFileReq = db.createMutableFile("generated-file.bin", "application/binary");

  tempFileReq.onsuccess = () => {
    dbLog(`a new File object has been created`);

    // Persist the opened file into a global var, so that the file handle will not
    // be invalidated once this function returns.
    tempFile = tempFileReq.result;

    let size = parseInt(document.querySelector("#file-size").value) || 0;

    generateFile(tempFile,size,(error) => {
        if (error) {
            dbLog(error.message);
            throw error;
        } else {
            dbLog("File written");

            const lockedFile = tempFile.open("readonly");
            const metaDataReq = lockedFile.getMetadata({size: true, lastModified: true});
            metaDataReq.onsuccess = () => {
                const {size, lastModified} = metaDataReq.result;
                dbLog(`tempFile metadata: ${JSON.stringify({size, lastModified})}`);
            };

            // Persist the MutableFile into indexedDB.
            const filename = "generated-file.bin";
            const transaction = db.transaction(["tempFiles"], "readwrite");
            const objectStore = transaction.objectStore("tempFiles");
            const request = objectStore.put(tempFile, filename);
            request.onsuccess = function(event) {
                dbLog(`tempFile has been stored into IndexedDB as "${filename}"`);
                readFile(tempFile);
            };
        }
    });
  };
});

function readFile(file) {
    const fileRequest = file.getFile();
    fileRequest.onsuccess = () => {
      // Create an ObjectURL from the file blob data.
      const fileURL = URL.createObjectURL(fileRequest.result);
      console.info("fileURL",fileURL);
      // Create a link that can be used to download the file.
      document.querySelector("#step2").style.display = "block";
      document.querySelector("#file-link-text").textContent = fileURL;
      const linkEl = document.querySelector("#file-link");
      //linkEl.href = fileURL;
      linkEl.textContent = file.name;
      linkEl.onclick = () => {
        download(fileURL,file.name);
        return false;
      };

    };
    fileRequest.onerror = () => {
      dbLog(`ERROR on reading the persisted mutable file: ${fileRequest.error.message}`);
    };
}

function download(url,filename) {
    browser.downloads.download({
        url: url,
        filename: filename
    },function(id) {
        if(!id) {
            dbLog(`Failed download: ${browser.runtime.lastError}`);
            return;
        }
        return true;
    });
}

function generateFile(file,totalSize,callback) {
    const chunkSize = 1024*1024;

    // Open the mutable file and write new data in it.
    const lockedFile = file.open("readwrite");
    let size = 0;
    function writeChunk() {
        if (size==totalSize)
            return callback(null);
        let bytesToWrite = Math.min(chunkSize,totalSize - size);
        let buffer = new Uint8Array(bytesToWrite);
        for(let i=0; i<bytesToWrite; i+=4) {
            let index = size + i;
            buffer[i] = (index & 0xff000000) >> 24;
            if(i+1<bytesToWrite)
                buffer[i+1] = (index & 0xff0000) >> 16;
            if(i+2<bytesToWrite)
                buffer[i+2] = (index & 0xff00) >> 8;
            if(i+3<bytesToWrite)
                buffer[i+3] = index & 0xff;
        }
        console.info("writeChunk",size,"/",totalSize,"=>",buffer.subarray(0,4),"...");
        size += bytesToWrite;
        const saveDataReq = lockedFile.append(buffer.buffer);
        saveDataReq.onsuccess = () => {
            writeChunk();
        };
        saveDataReq.onerror = () => {
            console.info("Error",saveDataReq.error.message);
            callback(saveDataReq.error);
        };

    }
    writeChunk();
}
