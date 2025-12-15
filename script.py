from flask import Flask, request, jsonify
from flask_cors import CORS
import yt_dlp
import os
import threading
import uuid
import json
from datetime import datetime
from pathlib import Path
import logging

# Setup logging
logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app)

downloads = {}

# Get user's Downloads folder
def get_downloads_folder():
    """Get the user's Downloads folder path"""
    try:
        home = Path.home()
        downloads_path = home / "Downloads" / "YT_Downloads"
        downloads_path.mkdir(parents=True, exist_ok=True)
        logger.info(f"Downloads folder set to: {downloads_path}")
        return str(downloads_path)
    except Exception as e:
        logger.error(f"Error creating downloads folder: {e}")
        # Fallback to current directory
        fallback_path = Path('./downloads')
        fallback_path.mkdir(exist_ok=True)
        return str(fallback_path)

DOWNLOAD_DIR = get_downloads_folder()

def download_task(task_id, playlist_url, mode, quality, output_path):
    """Background task for downloading"""
    try:
        logger.info(f"Starting download task {task_id}")
        logger.debug(f"URL: {playlist_url}, Mode: {mode}, Quality: {quality}")
        
        downloads[task_id]['status'] = 'downloading'
        downloads[task_id]['progress'] = 0

        def progress_hook(d):
            if d['status'] == 'downloading':
                try:
                    percent_str = d.get('_percent_str', '0%').strip().replace('%', '')
                    downloads[task_id]['progress'] = float(percent_str) if percent_str else 0
                    downloads[task_id]['current_file'] = d.get('filename', '')
                    
                    # Log progress every 10%
                    if downloads[task_id]['progress'] % 10 < 1:
                        logger.debug(f"Task {task_id}: {downloads[task_id]['progress']:.1f}% complete")
                except ValueError as e:
                    logger.warning(f"Error parsing progress: {e}")
            elif d['status'] == 'finished':
                downloads[task_id]['progress'] = 100
                logger.info(f"Task {task_id}: Download finished")

        ydl_opts = {
            'outtmpl': os.path.join(output_path, '%(playlist_index)s - %(title)s.%(ext)s'),
            'ignoreerrors': True,
            'progress_hooks': [progress_hook],
            'quiet': False,
            'no_warnings': False,
            'concurrent_fragment_downloads': 4,  # Faster downloads
            'retries': 10,
            'fragment_retries': 10,
            'http_chunk_size': 10485760,  # 10MB chunks for faster download
        }

        logger.debug(f"Mode: {mode}, Quality: {quality}")

        # Quality settings
        if mode == 'single-video' or mode == 'playlist-video':
            if quality == '2160p':
                ydl_opts['format'] = 'bestvideo[height<=2160]+bestaudio/best'
            elif quality == '1440p':
                ydl_opts['format'] = 'bestvideo[height<=1440]+bestaudio/best'
            elif quality == '1080p':
                ydl_opts['format'] = 'bestvideo[height<=1080]+bestaudio/best'
            elif quality == '720p':
                ydl_opts['format'] = 'bestvideo[height<=720]+bestaudio/best'
            elif quality == '480p':
                ydl_opts['format'] = 'bestvideo[height<=480]+bestaudio/best'
            elif quality == '360p':
                ydl_opts['format'] = 'bestvideo[height<=360]+bestaudio/best'
            else:
                ydl_opts['format'] = 'bestvideo+bestaudio/best'
            
            ydl_opts['merge_output_format'] = 'mp4'
            logger.info(f"Video format set to: {ydl_opts['format']}")
            
        elif mode == 'single-audio' or mode == 'playlist-audio':
            if quality == '320kbps':
                ydl_opts['format'] = 'bestaudio[abr>=320]/bestaudio'
                ydl_opts['postprocessors'] = [{
                    'key': 'FFmpegExtractAudio',
                    'preferredcodec': 'mp3',
                    'preferredquality': '320',
                }]
            elif quality == '256kbps':
                ydl_opts['format'] = 'bestaudio[abr>=256]/bestaudio'
                ydl_opts['postprocessors'] = [{
                    'key': 'FFmpegExtractAudio',
                    'preferredcodec': 'mp3',
                    'preferredquality': '256',
                }]
            elif quality == '192kbps':
                ydl_opts['format'] = 'bestaudio[abr>=192]/bestaudio'
                ydl_opts['postprocessors'] = [{
                    'key': 'FFmpegExtractAudio',
                    'preferredcodec': 'mp3',
                    'preferredquality': '192',
                }]
            elif quality == '128kbps':
                ydl_opts['format'] = 'bestaudio[abr>=128]/bestaudio'
                ydl_opts['postprocessors'] = [{
                    'key': 'FFmpegExtractAudio',
                    'preferredcodec': 'mp3',
                    'preferredquality': '128',
                }]
            else:
                ydl_opts['format'] = 'bestaudio/best'
                ydl_opts['postprocessors'] = [{
                    'key': 'FFmpegExtractAudio',
                    'preferredcodec': 'mp3',
                    'preferredquality': '192',
                }]
            
            logger.info(f"Audio format set to: {ydl_opts['format']}")
                
        elif mode == 'subtitles':
            ydl_opts['format'] = 'bestvideo+bestaudio/best'
            ydl_opts['writesubtitles'] = True
            ydl_opts['writeautomaticsub'] = True
            ydl_opts['subtitleslangs'] = ['en']
            ydl_opts['merge_output_format'] = 'mp4'
            logger.info("Subtitles mode enabled")

        logger.info("Starting yt-dlp extraction...")
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(playlist_url, download=True)
            downloads[task_id]['status'] = 'completed'
            downloads[task_id]['progress'] = 100
            downloads[task_id]['download_path'] = output_path

            if isinstance(info, dict):
                if 'entries' in info:
                    downloads[task_id]['playlist_title'] = info.get('title', 'Unknown Playlist')
                    downloads[task_id]['video_count'] = len([e for e in info.get('entries', []) if e])
                    logger.info(f"Playlist download completed: {downloads[task_id]['video_count']} videos")
                else:
                    downloads[task_id]['playlist_title'] = info.get('title', 'Unknown')
                    downloads[task_id]['video_count'] = 1
                    logger.info(f"Single video download completed: {downloads[task_id]['playlist_title']}")

        logger.info(f"Task {task_id} completed successfully")

    except Exception as e:
        logger.error(f"Error in task {task_id}: {str(e)}", exc_info=True)
        downloads[task_id]['status'] = 'failed'
        downloads[task_id]['error'] = str(e)

@app.route('/api/download', methods=['POST'])
def start_download():
    """Start a new download task"""
    try:
        data = request.json
        logger.info(f"Received download request: {data}")
        
        playlist_url = data.get('url')
        mode = data.get('mode', 'single-video')
        quality = data.get('quality', 'best')

        if not playlist_url:
            logger.warning("No URL provided in request")
            return jsonify({'error': 'No URL provided'}), 400

        task_id = str(uuid.uuid4())
        output_path = os.path.join(DOWNLOAD_DIR, task_id)
        os.makedirs(output_path, exist_ok=True)
        
        logger.info(f"Created download directory: {output_path}")

        downloads[task_id] = {
            'id': task_id,
            'url': playlist_url,
            'mode': mode,
            'quality': quality,
            'status': 'starting',
            'progress': 0,
            'created_at': datetime.now().isoformat(),
            'download_path': output_path
        }

        thread = threading.Thread(
            target=download_task,
            args=(task_id, playlist_url, mode, quality, output_path)
        )
        thread.daemon = True
        thread.start()
        
        logger.info(f"Started download thread for task {task_id}")

        return jsonify({
            'task_id': task_id, 
            'message': 'Download started',
            'download_path': output_path
        }), 202
        
    except Exception as e:
        logger.error(f"Error starting download: {str(e)}", exc_info=True)
        return jsonify({'error': str(e)}), 500

@app.route('/api/status/<task_id>', methods=['GET'])
def get_status(task_id):
    """Get download status"""
    logger.debug(f"Status check for task {task_id}")
    
    if task_id not in downloads:
        logger.warning(f"Task {task_id} not found")
        return jsonify({'error': 'Task not found'}), 404

    return jsonify(downloads[task_id])

@app.route('/api/downloads', methods=['GET'])
def list_downloads():
    """List all downloads"""
    logger.debug(f"Listing all downloads: {len(downloads)} tasks")
    return jsonify(list(downloads.values()))

@app.route('/api/playlist-info', methods=['POST'])
def get_playlist_info():
    """Get playlist information without downloading"""
    try:
        data = request.json
        playlist_url = data.get('url')
        
        logger.info(f"Fetching info for URL: {playlist_url}")

        if not playlist_url:
            logger.warning("No URL provided for playlist info")
            return jsonify({'error': 'No URL provided'}), 400

        ydl_opts = {
            'quiet': True,
            'no_warnings': True,
            'extract_flat': 'in_playlist',
        }

        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(playlist_url, download=False)

            # Check if it's a playlist or single video
            is_playlist = 'entries' in info and len(info.get('entries', [])) > 1

            response = {
                'title': info.get('title', 'Unknown'),
                'uploader': info.get('uploader', 'Unknown'),
                'thumbnail': info.get('thumbnail', ''),
                'is_playlist': is_playlist,
            }

            if is_playlist:
                response['video_count'] = len(info.get('entries', []))
                response['playlist_description'] = info.get('description', '')[:200]
                logger.info(f"Playlist info: {response['title']} ({response['video_count']} videos)")
            else:
                response['video_count'] = 1
                response['duration'] = info.get('duration', 0)
                response['view_count'] = info.get('view_count', 0)
                logger.info(f"Video info: {response['title']}")

            return jsonify(response)
            
    except Exception as e:
        logger.error(f"Error fetching playlist info: {str(e)}", exc_info=True)
        return jsonify({'error': str(e)}), 400

@app.route('/api/available-qualities', methods=['POST'])
def get_available_qualities():
    """Get available qualities for a video/playlist"""
    try:
        data = request.json
        playlist_url = data.get('url')
        
        logger.info(f"Fetching available qualities for: {playlist_url}")

        if not playlist_url:
            return jsonify({'error': 'No URL provided'}), 400

        ydl_opts = {
            'quiet': True,
            'no_warnings': True,
        }

        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(playlist_url, download=False)
            
            # Get first video if playlist
            if 'entries' in info:
                video_info = info['entries'][0] if info['entries'] else info
            else:
                video_info = info

            # Extract available formats
            formats = video_info.get('formats', [])
            
            video_qualities = set()
            audio_qualities = set()
            
            for fmt in formats:
                if fmt.get('vcodec') != 'none' and fmt.get('height'):
                    video_qualities.add(fmt['height'])
                if fmt.get('acodec') != 'none' and fmt.get('abr'):
                    audio_qualities.add(int(fmt['abr']))

            result = {
                'video_qualities': sorted(list(video_qualities), reverse=True),
                'audio_qualities': sorted(list(audio_qualities), reverse=True),
            }
            
            logger.info(f"Available qualities: Video={result['video_qualities']}, Audio={result['audio_qualities']}")
            return jsonify(result)
            
    except Exception as e:
        logger.error(f"Error fetching qualities: {str(e)}", exc_info=True)
        return jsonify({'error': str(e)}), 400

@app.route('/api/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'downloads_folder': DOWNLOAD_DIR,
        'active_downloads': len([d for d in downloads.values() if d['status'] == 'downloading']),
        'total_downloads': len(downloads)
    })

@app.route('/api/clear-downloads', methods=['POST'])
def clear_downloads():
    """Clear completed/failed downloads from memory"""
    try:
        global downloads
        active = {k: v for k, v in downloads.items() if v['status'] == 'downloading'}
        cleared_count = len(downloads) - len(active)
        downloads = active
        
        logger.info(f"Cleared {cleared_count} completed/failed downloads")
        return jsonify({
            'message': f'Cleared {cleared_count} downloads',
            'remaining': len(downloads)
        })
    except Exception as e:
        logger.error(f"Error clearing downloads: {str(e)}", exc_info=True)
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    os.makedirs(DOWNLOAD_DIR, exist_ok=True)
    logger.info("=" * 60)
    logger.info("YouTube Playlist Downloader API Starting...")
    logger.info("=" * 60)
    logger.info(f"Downloads will be saved to: {DOWNLOAD_DIR}")
    logger.info("Backend running on http://localhost:5000")
    logger.info("API Endpoints:")
    logger.info("  POST   /api/download           - Start download")
    logger.info("  GET    /api/status/<task_id>   - Check download status")
    logger.info("  GET    /api/downloads          - List all downloads")
    logger.info("  POST   /api/playlist-info      - Get video/playlist info")
    logger.info("  POST   /api/available-qualities - Get available qualities")
    logger.info("  GET    /api/health             - Health check")
    logger.info("  POST   /api/clear-downloads    - Clear completed downloads")
    logger.info("=" * 60)
    
    app.run(debug=True, host='0.0.0.0', port=5000)