const core = require('@actions/core');
const artifact = require('@actions/artifact');
const artifactClient = artifact.create();
const fs = require("fs");
const fsPromises = fs.promises;
const FormData = require('form-data');
const axios = require("axios").default
const StreamZip = require('node-stream-zip');
const pathJoiner = require('path').join;

const orePluginAction = (function() {

  const shouldLog = core.getBooleanInput("verboseLogging");

  function stripTrailingSlash(url) {
    if (url.endsWith("/")) {
      return url.substring(0, url.length - 1);
    } else {
      return url;
    }
  }

  function getJarFile(fileName) {
    return fileName.match(/.jar$/) !== null
  }

 function selectFile(directory, fileNamePredicate = fileName => true, fileContentsPredicate = (directoryName, fileName) => true) {
    try {
      const result = fs.readdirSync(directory).filter(fileName => {
        if (fileNamePredicate(fileName)) {
          verboseLog(`Detected file: ${fileName}`);
          return fileContentsPredicate(directory, fileName)
        }
      })[0];
      return fs.createReadStream(pathJoiner(directory, result));
    } catch (err) {
      console.error(err);
      core.setFailed(err.message)
    }
  }

  // https://stackoverflow.com/a/49428486
  function streamToString(stream) {
    const chunks = [];
    return new Promise((resolve, reject) => {
      stream.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      stream.on('error', (err) => reject(err));
      stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    })
  }

  async function checkForSpongePluginOrMcModInfoFile(directory, fileName) {
    const zip = new StreamZip.async({ file: pathJoiner(directory, fileName) });
    try {
      let isPlugin = zip.entryData('META-INF/sponge-plugins.json')
        .then(x => Promise.resolve(true))
        .catch(x => Promise.resolve(false));
      if (!isPlugin) {
        isPlugin = zip.entryData('mcmod.info')
          .then(x => Promise.resolve(true))
          .catch(x => Promise.resolve(false));
      }
      verboseLog(`Selecting file: ${isPlugin}`);
      return isPlugin;
    } finally {
      await zip.close();
    }
  }

  function verboseLog(message) {
    if (shouldLog) {
      console.log(message);
    }
  }

  return {
    // most @actions toolkit packages have async methods
    run: async function() {
      try {
        verboseLog("Starting deployment");
        // Get the plugin
        const pluginLocation = await artifactClient.downloadArtifact(core.getInput("plugin"), path = undefined, options = { createArtifactFolder: true });
        const tag = core.getInput("tag");
        const oreUrl = stripTrailingSlash(core.getInput("oreUrl"));
        const pluginId = core.getInput("pluginId");
        const apiKey = `OreApi apikey="${core.getInput("apiKey")}"`;

        verboseLog("Determining description");

        // Check to see if we have an artefact for the description, else consider it a string.
        const descriptionString = core.getInput("description");
        const text = () => Promise.resolve(descriptionString);
        const descriptionInput =
            await artifactClient.downloadArtifact(descriptionString, path = undefined, options = { createArtifactFolder: true })
                .then(artifact => {
                  if (artifact) {
                    verboseLog("Artifact detected, obtaining file");
                    return selectFile(artifact.downloadPath)
                  } else {
                    verboseLog("No artifact detected - treating as string");
                    return text();
                  }
                })
                .then(readStream => {
                  if (readStream) {
                    verboseLog("Reading stream");
                    return streamToString(readStream)
                  } else {
                    verboseLog("readStream was falsy - treating as string");
                    return text();
                  }
                })
                // eslint-disable-next-line no-unused-vars
                .catch(ignored => {
                  verboseLog(`Error: ${ignored}`);
                  text();
                })

        verboseLog(`Description: ${descriptionInput}`);
        const apiAuthUrl = `${oreUrl}/api/v2/authenticate`
        const apiPostVersionUrl = `${oreUrl}/api/v2/projects/${pluginId}/versions`

        // Start by authenticating with the Ore client
        
        verboseLog("Finding file to send");
        const fileToSend = selectFile(pluginLocation.downloadPath, getJarFile, checkForSpongePluginOrMcModInfoFile); // fsPromises.readFile(pluginLocation.downloadPath);
        let infoToSend;
        if (tag !== undefined && tag !== "") {
          infoToSend = {
            "create_forum_post": core.getBooleanInput("createForumPost"),
            "description": descriptionInput,
            "tags": {
              "Channel": core.getInput("channel")
            }
          }
        } else {
          infoToSend = {
            "create_forum_post": core.getBooleanInput("createForumPost"),
            "description": descriptionInput
          }
        }

        verboseLog("Attempting to authenticate against Ore v2");
        axios.post(apiAuthUrl,
            {
              "expires_in": 120
            },
          {
          headers: {
            "Authorization": apiKey
          }
        }).then(response => {
          if (response.status === 200) {
            verboseLog("Authenticated - attempting to upload");
            const sessionHeader = `OreApi session="${response.data.session}"`;
            const formData = new FormData();
            formData.append("plugin-info", JSON.stringify(infoToSend));
            formData.append("plugin-file", fileToSend);
            return axios({
              method: "POST",
              url: apiPostVersionUrl,
              data: formData,
              headers: {
                "Authorization": sessionHeader
              }
            });
          } else {
            return Promise.reject(`Did not complete authorisation (received status code ${response.status})`);
          }
        })
        .then(response => {
          if (response.status === 201) {
            console.log("Deployment successful");
            return Promise.resolve(response);
          } else {
            return Promise.reject(`Deployment failed with error code ${response.status}.`)
          }
        })
        .catch(error => {
          if (error.response) {
            // Request made and server responded
            console.log(error.response.data);
            console.log(error.response.status);
            console.log(error.response.headers);
          } else if (error.request) {
            // The request was made but no response was received
            console.log(error.request);
          } else {
            // Something happened in setting up the request that triggered an Error
            console.log('Error', error.message);
          }
      
          core.setFailed(error);
        })
      } catch (error) {
        core.setFailed(error.message);
      }
    }
  }
})();

orePluginAction.run();
