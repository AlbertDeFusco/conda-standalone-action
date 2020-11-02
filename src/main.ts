import * as core from '@actions/core';
import * as exec from '@actions/exec';
import * as tc from '@actions/tool-cache';
import { executionAsyncId } from 'async_hooks';
// import {wait} from './wait'

// const IS_WINDOWS: boolean = process.platform === "win32";
// const IS_MAC: boolean = process.platform === "darwin";
// const IS_LINUX: boolean = process.platform === "linux";
// const IS_UNIX: boolean = IS_MAC || IS_LINUX;
const CONDA_STANDALONE_BASE_URL = 'https://repo.anaconda.com/pkgs/misc/conda-execs';

interface ISucceedResult {
  ok: true;
  data: string;
}
interface IFailedResult {
  ok: false;
  error: Error;
}
type Result = ISucceedResult | IFailedResult;

export interface IArchitectures {
  [key: string]: string;
}

export interface IOperatingSystems {
  [key: string]: string;
}

const ARCHITECTURES: IArchitectures = {
  win32: "win-64",
  linux: "linux-64",
  darwin: "osx-64"
};

// const OS_NAMES: IOperatingSystems = {
//   win32: "Windows",
//   darwin: "MacOSX",
//   linux: "Linux"
// };

/**
 * Download specific version miniconda defined by version, arch and python major version
 *
 * @param condaStandaloneVersion
 */
async function downloadCondaStandalone(
  condaStandaloneVersion: string,
  platform: string
): Promise<Result> {
  let downloadPath: string;

  const arch: string = ARCHITECTURES[platform];
  if (!arch) {
    return { ok: false, error: new Error(`"${platform}" is not a valid platform.`) };
  }

  const downloadURL = `${CONDA_STANDALONE_BASE_URL}/conda-${condaStandaloneVersion}-${arch}.exe`;
  core.info(`Downloading Conda standalone from: ${downloadURL}`)

  // Look for cache to use
  const cachedCondaStandalone = tc.find('conda.exe', condaStandaloneVersion, arch);
  if (cachedCondaStandalone) {
    core.info(`Found cached Conda standalone at ${cachedCondaStandalone}`);
    downloadPath = cachedCondaStandalone;
  } else {
    try {
      downloadPath = await tc.downloadTool(downloadURL, 'conda.exe');
      core.debug(`Download successful ${downloadPath}`)
      core.info(`Caching Conda standalone ${downloadPath}`);

      await tc.cacheFile(
        "conda.exe",
        "conda.exe",
        `CondaStandalone-${condaStandaloneVersion}-${arch}`,
        condaStandaloneVersion,
        arch
      );
    } catch (err) {
      return {ok: false, error: err};
    }
  }
  return {ok: true, data: downloadPath};

}

async function run(): Promise<void> {
  try {
    const condaStandaloneVersion: string = core.getInput(
      "conda-standalone-version"
    );
    const result = await downloadCondaStandalone(
      condaStandaloneVersion,
      process.platform
    );
    if (!result.ok) {
      throw result.error;
    }

    const condaExe: string = result.data;

    await exec.exec(`chmod +x ${condaExe}`);

    const condaVersion: string = core.getInput("conda-version");

    core.info(`Creating base environment with Conda ${condaVersion}`);

    let condaBase: string;
    if (condaVersion == 'latest') {
      condaBase = 'conda';
    } else {
      condaBase = `conda=${condaVersion}`;
    }

    await exec.exec(`/home/runner/${condaExe} create -p ./miniconda ${condaBase}`);
    core.addPath('./miniconda/bin');
    await exec.exec('source ./miniconda/bin/activate root');

  } catch (error) {
    core.setFailed(error.message);
  }
}

run();
