import { useState, useEffect } from 'react';
import { Download, Music, Video, Loader2, CheckCircle2, XCircle, Info, ExternalLink, Folder } from 'lucide-react';

interface PlaylistInfo {
  title: string;
  video_count: number;
  uploader: string;
  thumbnail: string;
  is_playlist: boolean;
  duration?: number;
  view_count?: number;
  playlist_description?: string;
}

interface DownloadTask {
  id: string;
  url: string;
  mode: string;
  quality: string;
  status: 'starting' | 'downloading' | 'completed' | 'failed';
  progress: number;
  created_at: string;
  playlist_title?: string;
  video_count?: number;
  error?: string;
  current_file?: string;
  download_path?: string;
}

type DownloadMode = 'single-video' | 'single-audio' | 'playlist-video' | 'playlist-audio' | 'subtitles';

interface DownloadOption {
  id: DownloadMode;
  label: string;
  description: string;
  icon: string;
}

const DOWNLOAD_OPTIONS: DownloadOption[] = [
  {
    id: 'single-video',
    label: 'Download Single Video',
    description: 'Best quality',
    icon: '🎬'
  },
  {
    id: 'single-audio',
    label: 'Download Single Audio',
    description: 'MP3 format',
    icon: '🎵'
  },
  {
    id: 'playlist-video',
    label: 'Download Entire Playlist',
    description: 'All videos in best quality',
    icon: '📹'
  },
  {
    id: 'playlist-audio',
    label: 'Download Playlist as Audio',
    description: 'All videos as MP3',
    icon: '🎼'
  },
  {
    id: 'subtitles',
    label: 'Download with Subtitles',
    description: 'Includes subtitle files',
    icon: '📝'
  }
];

const VIDEO_QUALITIES = ['2160p', '1440p', '1080p', '720p', '480p', '360p', 'best'];
const AUDIO_QUALITIES = ['320kbps', '256kbps', '192kbps', '128kbps', 'best'];

const API_BASE = 'http://localhost:5000/api';

function App() {
  const [url, setUrl] = useState('');
  const [downloadMode, setDownloadMode] = useState<DownloadMode>('single-video');
  const [selectedQuality, setSelectedQuality] = useState('best');
  const [playlistInfo, setPlaylistInfo] = useState<PlaylistInfo | null>(null);
  const [loadingInfo, setLoadingInfo] = useState(false);
  const [infoError, setInfoError] = useState('');
  const [downloads, setDownloads] = useState<DownloadTask[]>([]);
  const [activeDownloads, setActiveDownloads] = useState<Set<string>>(new Set());
  const [showQualitySelector, setShowQualitySelector] = useState(false);

  // Auto-fetch playlist info when URL changes
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (url.trim() && (url.includes('youtube.com') || url.includes('youtu.be'))) {
        fetchPlaylistInfo();
      } else {
        setPlaylistInfo(null);
        setInfoError('');
      }
    }, 800);

    return () => clearTimeout(timeoutId);
  }, [url]);

  useEffect(() => {
    loadDownloads();
    const interval = setInterval(() => {
      if (activeDownloads.size > 0) {
        activeDownloads.forEach(taskId => {
          fetchDownloadStatus(taskId);
        });
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [activeDownloads]);

  const loadDownloads = async () => {
    try {
      const response = await fetch(`${API_BASE}/downloads`);
      const data = await response.json();
      setDownloads(data);
      const active = new Set(
        data.filter((d: DownloadTask) =>
          d.status === 'starting' || d.status === 'downloading'
        ).map((d: DownloadTask) => d.id)
      );
      setActiveDownloads(active);
    } catch (error) {
      console.error('Failed to load downloads:', error);
    }
  };

  const fetchDownloadStatus = async (taskId: string) => {
    try {
      const response = await fetch(`${API_BASE}/status/${taskId}`);
      const data = await response.json();
      setDownloads(prev =>
        prev.map(d => d.id === taskId ? data : d)
      );
      if (data.status === 'completed' || data.status === 'failed') {
        setActiveDownloads(prev => {
          const next = new Set(prev);
          next.delete(taskId);
          return next;
        });
      }
    } catch (error) {
      console.error('Failed to fetch status:', error);
    }
  };

  const fetchPlaylistInfo = async () => {
    if (!url.trim()) return;

    setLoadingInfo(true);
    setInfoError('');
    setPlaylistInfo(null);

    try {
      const response = await fetch(`${API_BASE}/playlist-info`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to fetch playlist info');
      }

      const data = await response.json();
      setPlaylistInfo(data);
    } catch (error) {
      setInfoError(error instanceof Error ? error.message : 'Failed to fetch playlist info');
    } finally {
      setLoadingInfo(false);
    }
  };

  const startDownload = async () => {
    if (!url.trim()) return;

    try {
      const response = await fetch(`${API_BASE}/download`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          url: url.trim(), 
          mode: downloadMode,
          quality: selectedQuality
        })
      });

      if (!response.ok) {
        throw new Error('Failed to start download');
      }

      const data = await response.json();
      setActiveDownloads(prev => new Set(prev).add(data.task_id));
      setUrl('');
      setPlaylistInfo(null);
      setShowQualitySelector(false);
      setSelectedQuality('best');
      loadDownloads();
    } catch (error) {
      alert('Failed to start download: ' + (error instanceof Error ? error.message : 'Unknown error'));
    }
  };

  const handleModeChange = (mode: DownloadMode) => {
    setDownloadMode(mode);
    setShowQualitySelector(true);
    setSelectedQuality('best');
  };

  const getQualityOptions = () => {
    if (downloadMode.includes('audio')) {
      return AUDIO_QUALITIES;
    }
    return VIDEO_QUALITIES;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'text-green-600';
      case 'failed': return 'text-red-600';
      case 'downloading': return 'text-blue-600';
      default: return 'text-gray-600';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed': return <CheckCircle2 className="w-5 h-5" />;
      case 'failed': return <XCircle className="w-5 h-5" />;
      case 'downloading': return <Loader2 className="w-5 h-5 animate-spin" />;
      default: return <Loader2 className="w-5 h-5 animate-spin" />;
    }
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatViewCount = (count: number) => {
    if (count >= 1000000) {
      return `${(count / 1000000).toFixed(1)}M views`;
    } else if (count >= 1000) {
      return `${(count / 1000).toFixed(1)}K views`;
    }
    return `${count} views`;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-cyan-50">
      <div className="max-w-6xl mx-auto px-4 py-12">
        <div className="text-center mb-12">
          <div className="flex items-center justify-center mb-4">
            <div className="bg-gradient-to-r from-blue-600 to-cyan-600 p-4 rounded-2xl shadow-lg">
              <Download className="w-10 h-10 text-white" />
            </div>
          </div>
          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            YouTube Playlist Downloader
          </h1>
          <p className="text-gray-600 text-lg">
            Download videos and playlists with custom quality - saves to your Downloads folder
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-8 mb-8 border border-gray-100">
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                YouTube URL
              </label>
              <input
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="Paste YouTube video or playlist URL..."
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
              />
              {loadingInfo && (
                <div className="mt-2 flex items-center gap-2 text-sm text-blue-600">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Loading preview...
                </div>
              )}
              {infoError && (
                <p className="mt-2 text-sm text-red-600 flex items-center gap-1">
                  <XCircle className="w-4 h-4" />
                  {infoError}
                </p>
              )}
            </div>

            {playlistInfo && (
              <div className="bg-gradient-to-r from-blue-50 to-cyan-50 rounded-xl p-6 border border-blue-100">
                <div className="flex gap-6">
                  {playlistInfo.thumbnail && (
                    <img
                      src={playlistInfo.thumbnail}
                      alt={playlistInfo.title}
                      className="w-40 h-24 object-cover rounded-lg shadow-md flex-shrink-0"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <h3 className="text-xl font-semibold text-gray-900 mb-2 truncate">
                      {playlistInfo.title}
                    </h3>
                    <div className="flex items-center gap-4 text-sm text-gray-600 flex-wrap">
                      <span className="flex items-center gap-1">
                        <Video className="w-4 h-4" />
                        {playlistInfo.video_count} {playlistInfo.is_playlist ? 'videos' : 'video'}
                      </span>
                      {playlistInfo.duration && (
                        <>
                          <span>•</span>
                          <span>{formatDuration(playlistInfo.duration)}</span>
                        </>
                      )}
                      {playlistInfo.view_count && (
                        <>
                          <span>•</span>
                          <span>{formatViewCount(playlistInfo.view_count)}</span>
                        </>
                      )}
                      <span>•</span>
                      <span className="truncate">{playlistInfo.uploader}</span>
                    </div>
                    {playlistInfo.is_playlist && playlistInfo.playlist_description && (
                      <p className="mt-2 text-sm text-gray-600 line-clamp-2">
                        {playlistInfo.playlist_description}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-4">
                Download Options
              </label>
              <div className="space-y-3">
                {DOWNLOAD_OPTIONS.map((option) => (
                  <button
                    key={option.id}
                    onClick={() => handleModeChange(option.id)}
                    className={`w-full p-4 rounded-lg border-2 text-left transition-all ${
                      downloadMode === option.id
                        ? 'border-blue-600 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <span className="text-2xl mt-1">{option.icon}</span>
                      <div className="flex-1">
                        <p className={`font-medium ${
                          downloadMode === option.id
                            ? 'text-blue-900'
                            : 'text-gray-900'
                        }`}>
                          {option.label}
                        </p>
                        <p className="text-sm text-gray-600">{option.description}</p>
                      </div>
                      <div className={`w-6 h-6 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                        downloadMode === option.id
                          ? 'border-blue-600 bg-blue-600'
                          : 'border-gray-300'
                      }`}>
                        {downloadMode === option.id && (
                          <div className="w-2 h-2 bg-white rounded-sm"></div>
                        )}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {showQualitySelector && (
              <div className="bg-gray-50 rounded-lg p-6 border border-gray-200">
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  Select Quality
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {getQualityOptions().map((quality) => (
                    <button
                      key={quality}
                      onClick={() => setSelectedQuality(quality)}
                      className={`px-4 py-3 rounded-lg border-2 font-medium transition-all ${
                        selectedQuality === quality
                          ? 'border-blue-600 bg-blue-600 text-white'
                          : 'border-gray-300 bg-white text-gray-700 hover:border-blue-400'
                      }`}
                    >
                      {quality}
                    </button>
                  ))}
                </div>
                <p className="mt-3 text-xs text-gray-500">
                  {downloadMode.includes('audio') 
                    ? 'Higher bitrate = better audio quality but larger file size'
                    : 'Higher resolution = better video quality but larger file size'}
                </p>
              </div>
            )}

            <button
              onClick={startDownload}
              disabled={!url.trim() || loadingInfo}
              className="w-full py-4 bg-gradient-to-r from-blue-600 to-cyan-600 text-white rounded-xl hover:from-blue-700 hover:to-cyan-700 disabled:from-gray-300 disabled:to-gray-300 disabled:cursor-not-allowed transition-all font-semibold text-lg shadow-lg hover:shadow-xl flex items-center justify-center gap-2"
            >
              <Download className="w-6 h-6" />
              Start Download {selectedQuality !== 'best' && `(${selectedQuality})`}
            </button>
          </div>
        </div>

        {downloads.length > 0 && (
          <div>
            <h2 className="text-2xl font-bold text-gray-900 mb-6">Downloads</h2>
            <div className="space-y-4">
              {downloads.map((download) => (
                <div
                  key={download.id}
                  className="bg-white rounded-xl shadow-md p-6 border border-gray-100 hover:shadow-lg transition-shadow"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-2">
                        <div className={getStatusColor(download.status)}>
                          {getStatusIcon(download.status)}
                        </div>
                        <h3 className="font-semibold text-gray-900 truncate">
                          {download.playlist_title || 'Loading...'}
                        </h3>
                      </div>
                      <div className="flex items-center gap-3 text-sm text-gray-600 flex-wrap">
                        <span className="flex items-center gap-1">
                          {download.mode.includes('audio') ? (
                            <Music className="w-4 h-4" />
                          ) : (
                            <Video className="w-4 h-4" />
                          )}
                          {download.mode.replace('-', ' ').toUpperCase()}
                        </span>
                        {download.quality && download.quality !== 'best' && (
                          <>
                            <span>•</span>
                            <span className="font-medium">{download.quality}</span>
                          </>
                        )}
                        {download.video_count && (
                          <>
                            <span>•</span>
                            <span>{download.video_count} videos</span>
                          </>
                        )}
                        <span>•</span>
                        <span className="capitalize">{download.status}</span>
                      </div>
                      {download.error && (
                        <p className="mt-2 text-sm text-red-600">{download.error}</p>
                      )}
                      {download.status === 'completed' && download.download_path && (
                        <div className="mt-2 flex items-center gap-2 text-sm text-green-600">
                          <Folder className="w-4 h-4" />
                          <span className="truncate">Saved to: {download.download_path}</span>
                        </div>
                      )}
                    </div>
                    <a
                      href={download.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-gray-400 hover:text-blue-600 transition-colors flex-shrink-0 ml-2"
                    >
                      <ExternalLink className="w-5 h-5" />
                    </a>
                  </div>

                  {(download.status === 'downloading' || download.status === 'starting') && (
                    <div>
                      <div className="flex items-center justify-between text-sm mb-2">
                        <span className="text-gray-600">Progress</span>
                        <span className="font-semibold text-blue-600">
                          {download.progress.toFixed(1)}%
                        </span>
                      </div>
                      <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-blue-600 to-cyan-600 transition-all duration-300 rounded-full"
                          style={{ width: `${download.progress}%` }}
                        />
                      </div>
                      {download.current_file && (
                        <p className="mt-2 text-xs text-gray-500 truncate">
                          {download.current_file}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;