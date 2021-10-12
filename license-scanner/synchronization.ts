import { Mutex } from "async-mutex"
import os from "os"
import PQueue from "p-queue"

export const downloadMutex = new Mutex()

export const scanQueueSize = os.cpus().length
export const scanQueue = new PQueue({ concurrency: scanQueueSize })
