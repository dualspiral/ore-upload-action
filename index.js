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

  async function selectFile(directory, fileNamePredicate = fileName => true, fileContentsPredicate = (directoryName, fileName) => true) {
    try {
      const result = fs.readdirSync(directory).filter(fileName => {
        if (fileNamePredicate(fileName)) {
          return fileContentsPredicate(directory, fileName)
        }
      })[0];
      return fsPromises.readFile(pathJoiner(directory, result));
    } catch (err) {
      console.error(err);
      core.setFailed(err.message)
    }
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
        const projectId = core.getInput("projectId");
        const apiKey = `OreApi apikey="${core.getInput("apiKey")}"`;

        verboseLog("Determining description");

        // Check to see if we have an artefact for the description, else consider it a string.
        const descriptionString = core.getInput("description");
        const descriptionInput =
            await artifactClient.downloadArtifact(descriptionString, options = { createArtifactFolder: true })
                .then(response => fsPromises.readFile(response.downloadPath))
                .then(buffer => buffer.toString())
                // eslint-disable-next-line no-unused-vars
                .catch(ignored => Promise.resolve(descriptionString))

        verboseLog(`Description: ${descriptionInput}`);
        const apiAuthUrl = `${oreUrl}/api/v2/authenticate`
        const apiPostVersionUrl = `${oreUrl}/api/v2/${projectId}/versions`

        // Start by authenticating with the Ore client
        
        verboseLog("Finding file to send");
        const fileToSend = await selectFile(pluginLocation.downloadPath, getJarFile, checkForSpongePluginOrMcModInfoFile); // fsPromises.readFile(pluginLocation.downloadPath);
        let infoToSend;
        if (tag !== undefined && tag !== "") {
          infoToSend = {
            "create_forum_post": core.getBooleanInput("createForumPost"),
            "description": descriptionInput,
            "tags": core.getInput("tag")
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
            const requestHeaders = formData.getHeaders({
              "Authorization": sessionHeader
            });
            return axios.post(apiPostVersionUrl,
                formData,
                {
                  headers: requestHeaders
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
        .catch(rejection => {
          core.setFailed(rejection);
        })
      } catch (error) {
        core.setFailed(error.message);
      }
    }
  }
})();

orePluginAction.run();
